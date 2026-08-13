// The COM shell around the text service: the class factory TSF instantiates it
// through, and the self-registration `regsvr32` calls — which is what running
// register.swift is on macOS, and what dropping a .conf into the fcitx5 data
// directory is on Linux.
//
// Registration is in two halves. The first is ordinary COM: a CLSID key naming
// this DLL as the server. The second is TSF's own — the class has to be filed
// under the keyboard category and registered as a language profile, or Windows
// has a COM object it can create and no reason to ever create it.

#include "ipabet.h"

#include <shlwapi.h>
#include <algorithm>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

namespace ipabet {

namespace {

HINSTANCE g_dll = nullptr;
LONG g_locks = 0;

const WCHAR kDescription[] = L"IPAbet";
// The language a profile is filed under is not optional — TSF has no neutral
// slot — so IPAbet is filed under all of them, which is as close as this
// platform gets to what it means: a phonetic alphabet is not a language, and
// belongs wherever the user already types. Falling back to en-US only if the
// machine somehow reports no input languages at all.
const LANGID kFallbackLangId = MAKELANGID(LANG_ENGLISH, SUBLANG_ENGLISH_US);

/// The input languages this machine has, taken from the keyboard layouts
/// already registered with TSF. Read at registration time rather than baked in,
/// so the service turns up under the languages actually in use.
std::vector<LANGID> InstalledInputLanguages(ITfInputProcessorProfileMgr *mgr) {
    std::vector<LANGID> langs;
    IEnumTfInputProcessorProfiles *e = nullptr;
    if (FAILED(mgr->EnumProfiles(0, &e))) return langs;

    TF_INPUTPROCESSORPROFILE p{};
    ULONG got = 0;
    while (e->Next(1, &p, &got) == S_OK && got == 1) {
        if (p.dwProfileType != TF_PROFILETYPE_KEYBOARDLAYOUT) continue;
        if (std::find(langs.begin(), langs.end(), p.langid) == langs.end()) {
            langs.push_back(p.langid);
        }
    }
    e->Release();
    return langs;
}

std::wstring ModulePath() {
    WCHAR path[MAX_PATH]{};
    GetModuleFileNameW(g_dll, path, MAX_PATH);
    return path;
}

class ClassFactory : public IClassFactory {
public:
    STDMETHODIMP QueryInterface(REFIID riid, void **ppv) override {
        if (!ppv) return E_INVALIDARG;
        *ppv = nullptr;
        if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_IClassFactory)) {
            *ppv = static_cast<IClassFactory *>(this);
            AddRef();
            return S_OK;
        }
        return E_NOINTERFACE;
    }
    STDMETHODIMP_(ULONG) AddRef() override { return 2; }   // a singleton, never freed
    STDMETHODIMP_(ULONG) Release() override { return 1; }

    STDMETHODIMP CreateInstance(IUnknown *outer, REFIID riid, void **ppv) override {
        if (!ppv) return E_INVALIDARG;
        *ppv = nullptr;
        if (outer) return CLASS_E_NOAGGREGATION;
        TextService *ts = new (std::nothrow) TextService;
        if (!ts) return E_OUTOFMEMORY;
        HRESULT hr = ts->QueryInterface(riid, ppv);
        ts->Release();
        return hr;
    }

    STDMETHODIMP LockServer(BOOL lock) override {
        lock ? InterlockedIncrement(&g_locks) : InterlockedDecrement(&g_locks);
        return S_OK;
    }
};

ClassFactory g_factory;

std::wstring GuidToString(REFGUID guid) {
    WCHAR buf[64]{};
    StringFromGUID2(guid, buf, 64);
    return buf;
}

bool WriteKey(HKEY root, const std::wstring &sub, const WCHAR *name, const std::wstring &value) {
    HKEY key = nullptr;
    if (RegCreateKeyExW(root, sub.c_str(), 0, nullptr, 0, KEY_WRITE, nullptr, &key, nullptr) !=
        ERROR_SUCCESS) {
        return false;
    }
    LONG rc = RegSetValueExW(key, name, 0, REG_SZ, (const BYTE *)value.c_str(),
                             (DWORD)((value.size() + 1) * sizeof(WCHAR)));
    RegCloseKey(key);
    return rc == ERROR_SUCCESS;
}

} // namespace

#ifdef IPABET_DEBUG
void Dbg(const char *fmt, ...) {
    const char *path = getenv("IPABET_DEBUG_LOG");
    if (!path) return;
    FILE *f = nullptr;
    if (fopen_s(&f, path, "a") != 0 || !f) return;
    va_list args;
    va_start(args, fmt);
    vfprintf(f, fmt, args);
    va_end(args);
    fputc('\n', f);
    fclose(f);
}
#endif

std::string TextService::LoadSpec() {
    // Beside the DLL: the installer puts them in the same directory, and a
    // build tree has them there too, so development needs no install step.
    std::wstring path = ModulePath();
    size_t slash = path.find_last_of(L'\\');
    if (slash != std::wstring::npos) path.resize(slash + 1);
    path += L"ipabet.json";

    std::ifstream in(path.c_str(), std::ios::binary);
    if (!in) return {};
    std::ostringstream buf;
    buf << in.rdbuf();
    return buf.str();
}

HRESULT RegisterServer(HINSTANCE module) {
    g_dll = module;
    const std::wstring clsid = GuidToString(CLSID_IpabetTextService);
    // HKLM\SOFTWARE\Classes, not the merged HKEY_CLASSES_ROOT view: install and
    // uninstall both run as SYSTEM, and a write through the merged view can land
    // in the calling account's hive rather than the machine's.
    const std::wstring base = L"SOFTWARE\\Classes\\CLSID\\" + clsid;

    if (!WriteKey(HKEY_LOCAL_MACHINE, base, nullptr, kDescription)) return E_FAIL;
    if (!WriteKey(HKEY_LOCAL_MACHINE, base + L"\\InprocServer32", nullptr, ModulePath())) return E_FAIL;
    if (!WriteKey(HKEY_LOCAL_MACHINE, base + L"\\InprocServer32", L"ThreadingModel", L"Apartment")) {
        return E_FAIL;
    }

    ITfInputProcessorProfileMgr *profiles = nullptr;
    HRESULT hr = CoCreateInstance(CLSID_TF_InputProcessorProfiles, nullptr, CLSCTX_INPROC_SERVER,
                                  IID_ITfInputProcessorProfileMgr, (void **)&profiles);
    if (FAILED(hr)) return hr;

    std::vector<LANGID> langs = InstalledInputLanguages(profiles);
    if (langs.empty()) langs.push_back(kFallbackLangId);
    const std::wstring path = ModulePath();
    for (LANGID lang : langs) {
        hr = profiles->RegisterProfile(CLSID_IpabetTextService, lang, GUID_IpabetProfile,
                                       kDescription, (ULONG)wcslen(kDescription), path.c_str(),
                                       (ULONG)path.size(), 0, nullptr, 0, TRUE, 0);
        if (FAILED(hr)) break;
    }
    profiles->Release();
    if (FAILED(hr)) return hr;

    // Without the keyboard category the profile exists and is never offered.
    ITfCategoryMgr *categories = nullptr;
    hr = CoCreateInstance(CLSID_TF_CategoryMgr, nullptr, CLSCTX_INPROC_SERVER, IID_ITfCategoryMgr,
                          (void **)&categories);
    if (FAILED(hr)) return hr;
    hr = categories->RegisterCategory(CLSID_IpabetTextService, GUID_TFCAT_TIP_KEYBOARD,
                                      CLSID_IpabetTextService);
    categories->Release();
    return hr;
}

HRESULT UnregisterServer() {
    // The registry is the authoritative record, so it goes first and does not
    // depend on anything else working.
    //
    // Uninstall runs this as SYSTEM — MSI defers the action and does not
    // impersonate, because writing a machine-wide profile needs the elevated
    // half of the install. TSF's profile enumeration answers for the *calling*
    // user, and SYSTEM has no input profiles, so asking it which languages to
    // unregister returned nothing and the service survived its own uninstall.
    // Removing the keys outright does not care who is asking.
    HRESULT result = S_OK;
    const std::wstring clsid = GuidToString(CLSID_IpabetTextService);

    // HKLM\SOFTWARE\Classes rather than HKEY_CLASSES_ROOT: the latter is a
    // merged view, and under SYSTEM a delete through it can land in SYSTEM's
    // own hive instead of the machine's.
    const std::wstring com = L"SOFTWARE\\Classes\\CLSID\\" + clsid;
    LONG rc = RegDeleteTreeW(HKEY_LOCAL_MACHINE, com.c_str());
    if (rc != ERROR_SUCCESS && rc != ERROR_FILE_NOT_FOUND) result = HRESULT_FROM_WIN32(rc);

    // What the profile enumeration actually reads.
    const std::wstring tip = L"SOFTWARE\\Microsoft\\CTF\\TIP\\" + clsid;
    rc = RegDeleteTreeW(HKEY_LOCAL_MACHINE, tip.c_str());
    if (rc != ERROR_SUCCESS && rc != ERROR_FILE_NOT_FOUND && SUCCEEDED(result)) {
        result = HRESULT_FROM_WIN32(rc);
    }

    // Then ask TSF to forget it too, best effort: this is what tells a running
    // session, and it is expected to find nothing when the keys are already
    // gone or when SYSTEM is asking.
    ITfInputProcessorProfileMgr *profiles = nullptr;
    if (SUCCEEDED(CoCreateInstance(CLSID_TF_InputProcessorProfiles, nullptr,
                                   CLSCTX_INPROC_SERVER, IID_ITfInputProcessorProfileMgr,
                                   (void **)&profiles))) {
        std::vector<LANGID> mine;
        IEnumTfInputProcessorProfiles *e = nullptr;
        if (SUCCEEDED(profiles->EnumProfiles(0, &e))) {
            TF_INPUTPROCESSORPROFILE p{};
            ULONG got = 0;
            while (e->Next(1, &p, &got) == S_OK && got == 1) {
                if (IsEqualCLSID(p.clsid, CLSID_IpabetTextService)) mine.push_back(p.langid);
            }
            e->Release();
        }
        for (LANGID lang : mine) {
            profiles->UnregisterProfile(CLSID_IpabetTextService, lang, GUID_IpabetProfile, 0);
        }
        profiles->Release();
    }

    ITfCategoryMgr *categories = nullptr;
    if (SUCCEEDED(CoCreateInstance(CLSID_TF_CategoryMgr, nullptr, CLSCTX_INPROC_SERVER,
                                   IID_ITfCategoryMgr, (void **)&categories))) {
        categories->UnregisterCategory(CLSID_IpabetTextService, GUID_TFCAT_TIP_KEYBOARD,
                                       CLSID_IpabetTextService);
        categories->Release();
    }

    return result;
}

} // namespace ipabet

// --- DLL exports -----------------------------------------------------------

BOOL WINAPI DllMain(HINSTANCE module, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        ipabet::g_dll = module;
        DisableThreadLibraryCalls(module);
    }
    return TRUE;
}

STDAPI DllGetClassObject(REFCLSID rclsid, REFIID riid, void **ppv) {
    if (!IsEqualCLSID(rclsid, ipabet::CLSID_IpabetTextService)) return CLASS_E_CLASSNOTAVAILABLE;
    return ipabet::g_factory.QueryInterface(riid, ppv);
}

STDAPI DllCanUnloadNow() { return ipabet::g_locks == 0 ? S_OK : S_FALSE; }

STDAPI DllRegisterServer() { return ipabet::RegisterServer(ipabet::g_dll); }

STDAPI DllUnregisterServer() { return ipabet::UnregisterServer(); }
