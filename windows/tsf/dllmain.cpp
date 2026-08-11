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
    const std::wstring base = L"CLSID\\" + clsid;

    if (!WriteKey(HKEY_CLASSES_ROOT, base, nullptr, kDescription)) return E_FAIL;
    if (!WriteKey(HKEY_CLASSES_ROOT, base + L"\\InprocServer32", nullptr, ModulePath())) return E_FAIL;
    if (!WriteKey(HKEY_CLASSES_ROOT, base + L"\\InprocServer32", L"ThreadingModel", L"Apartment")) {
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
    // Every failure here is reported. Swallowing them is what turns a botched
    // uninstall into a profile that survives it, and a reinstall that registers
    // a second copy alongside the first.
    HRESULT result = S_OK;

    ITfInputProcessorProfileMgr *profiles = nullptr;
    HRESULT hr = CoCreateInstance(CLSID_TF_InputProcessorProfiles, nullptr, CLSCTX_INPROC_SERVER,
                                  IID_ITfInputProcessorProfileMgr, (void **)&profiles);
    if (SUCCEEDED(hr)) {
        // Which languages it went in under is whatever was installed at the
        // time, so ask rather than assume: anything filed under this class is
        // ours to take back out.
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
            HRESULT one =
                profiles->UnregisterProfile(CLSID_IpabetTextService, lang, GUID_IpabetProfile, 0);
            if (FAILED(one)) hr = one;
        }
        profiles->Release();
    }
    if (FAILED(hr)) result = hr;

    ITfCategoryMgr *categories = nullptr;
    hr = CoCreateInstance(CLSID_TF_CategoryMgr, nullptr, CLSCTX_INPROC_SERVER, IID_ITfCategoryMgr,
                          (void **)&categories);
    if (SUCCEEDED(hr)) {
        hr = categories->UnregisterCategory(CLSID_IpabetTextService, GUID_TFCAT_TIP_KEYBOARD,
                                            CLSID_IpabetTextService);
        categories->Release();
    }
    if (FAILED(hr) && SUCCEEDED(result)) result = hr;

    const std::wstring clsid = GuidToString(CLSID_IpabetTextService);
    const std::wstring base = L"CLSID\\" + clsid;
    LONG rc = RegDeleteTreeW(HKEY_CLASSES_ROOT, base.c_str());
    if (rc != ERROR_SUCCESS && rc != ERROR_FILE_NOT_FOUND && SUCCEEDED(result)) {
        result = HRESULT_FROM_WIN32(rc);
    }

    // The COM key is only where the class lives. What the profile enumeration
    // reads is TSF's own key, and UnregisterProfile leaves it behind — so the
    // service keeps turning up as registered after a clean-looking uninstall.
    const std::wstring tip = L"SOFTWARE\\Microsoft\\CTF\\TIP\\" + clsid;
    rc = RegDeleteTreeW(HKEY_LOCAL_MACHINE, tip.c_str());
    if (rc != ERROR_SUCCESS && rc != ERROR_FILE_NOT_FOUND && SUCCEEDED(result)) {
        result = HRESULT_FROM_WIN32(rc);
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
