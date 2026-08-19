// Asks Windows what it thinks is registered, so a registration failure is a
// failing check rather than a keyboard that quietly never appears. The macOS
// gate has the same three subcommands over TIS, for the same reason.
//
//   profile-probe list            every registered text service profile
//   profile-probe assert-present  exit 0 if IPAbet is registered, 1 if not
//   profile-probe assert-enabled  exit 0 if IPAbet is in the calling user's
//                                 keyboard list — registration alone is not
//                                 that, and the difference is the difference
//                                 between installed and visible
//   profile-probe enable-select   enable IPAbet and make it the active profile
//   profile-probe register <dll>    call DllRegisterServer, report the HRESULT
//   profile-probe unregister <dll>  call DllUnregisterServer, report the HRESULT
//
// The register commands exist because regsvr32 reports failure in a message box
// it cannot show under automation, and suppressing that with /s throws the
// reason away — leaving "it did not register" with no explanation attached.
//
// Exit codes are the interface: 0 success, 1 the answer was no, 2 misuse.

#include <windows.h>
#include <msctf.h>

#include <cstdio>
#include <cstring>
#include <string>

namespace {

// {6B2E1F0C-9A44-4C3B-B0D5-1E7A2C5D8F31} — must match tsf/ipabet.cpp.
const CLSID kService = {
    0x6b2e1f0c, 0x9a44, 0x4c3b, {0xb0, 0xd5, 0x1e, 0x7a, 0x2c, 0x5d, 0x8f, 0x31}};
// {C4D9A7E2-3F18-4B6A-9E52-7A0B4D6C8125}
const GUID kProfile = {
    0xc4d9a7e2, 0x3f18, 0x4b6a, {0x9e, 0x52, 0x7a, 0x0b, 0x4d, 0x6c, 0x81, 0x25}};

std::string ToString(REFGUID guid) {
    WCHAR wide[64]{};
    StringFromGUID2(guid, wide, 64);
    char narrow[64]{};
    WideCharToMultiByte(CP_UTF8, 0, wide, -1, narrow, sizeof(narrow), nullptr, nullptr);
    return narrow;
}

/// Exact match on both ids. Matching the class alone would pass on any profile
/// the service happens to own, which is the kind of near-miss that lets a
/// registration bug through.
bool IsIpabet(const TF_INPUTPROCESSORPROFILE &p) {
    return IsEqualCLSID(p.clsid, kService) && IsEqualGUID(p.guidProfile, kProfile);
}

int WalkLang(ITfInputProcessorProfileMgr *mgr, LANGID lang, bool print,
             TF_INPUTPROCESSORPROFILE *found, int *total) {
    IEnumTfInputProcessorProfiles *e = nullptr;
    if (FAILED(mgr->EnumProfiles(lang, &e))) return 0;

    int hits = 0;
    TF_INPUTPROCESSORPROFILE p{};
    ULONG got = 0;
    while (e->Next(1, &p, &got) == S_OK && got == 1) {
        (*total)++;
        const bool ours = IsIpabet(p);
        if (ours) {
            hits++;
            if (found) *found = p;
        }
        if (print) {
            printf("%s lang=0x%04x clsid=%s profile=%s%s\n",
                   p.dwProfileType == TF_PROFILETYPE_INPUTPROCESSOR ? "tip     " : "keyboard",
                   p.langid, ToString(p.clsid).c_str(), ToString(p.guidProfile).c_str(),
                   ours ? "  <- IPAbet" : "");
        }
    }
    e->Release();
    return hits;
}

/// Enumerates every profile, reporting how many were seen in `total` — the
/// count is what separates "IPAbet is missing" from "the enumeration came back
/// empty", which are different bugs with the same symptom.
int Walk(ITfInputProcessorProfileMgr *mgr, bool print, TF_INPUTPROCESSORPROFILE *found,
         int *total) {
    int seen = 0;
    int hits = WalkLang(mgr, 0, print, found, &seen);
    // A zero langid is documented as "all languages"; if it turns out to mean
    // "the language whose id is zero", ask for the one IPAbet registers under.
    if (seen == 0) {
        hits = WalkLang(mgr, MAKELANGID(LANG_ENGLISH, SUBLANG_ENGLISH_US), print, found, &seen);
    }
    if (total) *total = seen;
    return hits;
}

} // namespace

/// Loads the text service and calls one of its self-registration exports.
int CallRegistrationExport(const char *dll, const char *entry) {
    HMODULE module = LoadLibraryA(dll);
    if (!module) {
        fprintf(stderr, "LoadLibrary(%s) failed: %lu\n", dll, GetLastError());
        return 2;
    }
    typedef HRESULT(STDAPICALLTYPE * Fn)();
    Fn fn = (Fn)GetProcAddress(module, entry);
    if (!fn) {
        fprintf(stderr, "%s is not exported: %lu\n", entry, GetLastError());
        FreeLibrary(module);
        return 2;
    }
    HRESULT hr = fn();
    printf("%s returned 0x%08lx\n", entry, hr);
    FreeLibrary(module);
    return SUCCEEDED(hr) ? 0 : 1;
}

int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr,
                "usage: profile-probe list|assert-present|assert-enabled|enable-select|"
                "register <dll>|"
                "unregister <dll>\n");
        return 2;
    }
    const char *cmd = argv[1];

    if (strcmp(cmd, "register") == 0 || strcmp(cmd, "unregister") == 0) {
        if (argc != 3) {
            fprintf(stderr, "usage: profile-probe %s <dll>\n", cmd);
            return 2;
        }
        // COM has to be up: the exports reach the profile manager through it.
        if (FAILED(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED))) return 2;
        const int rc = CallRegistrationExport(
            argv[2], strcmp(cmd, "register") == 0 ? "DllRegisterServer" : "DllUnregisterServer");
        CoUninitialize();
        return rc;
    }

    if (FAILED(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED))) return 2;

    ITfInputProcessorProfileMgr *mgr = nullptr;
    HRESULT hr = CoCreateInstance(CLSID_TF_InputProcessorProfiles, nullptr, CLSCTX_INPROC_SERVER,
                                  IID_ITfInputProcessorProfileMgr, (void **)&mgr);
    if (FAILED(hr)) {
        fprintf(stderr, "no profile manager: 0x%08lx\n", hr);
        CoUninitialize();
        return 2;
    }

    int rc = 2;
    int total = 0;
    if (strcmp(cmd, "list") == 0) {
        Walk(mgr, true, nullptr, &total);
        printf("%d profiles total.\n", total);
        rc = 0;
    } else if (strcmp(cmd, "assert-present") == 0) {
        const int hits = Walk(mgr, false, nullptr, &total);
        if (hits > 0) {
            // One entry per input language is the intent, so the count is not
            // an error by itself. A repeat within a single language would be.
            printf("IPAbet is registered under %d language%s.\n", hits, hits == 1 ? "" : "s");
            rc = 0;
        } else {
            fprintf(stderr, "IPAbet is NOT registered (%d profiles enumerated).\n", total);
            rc = 1;
        }
    } else if (strcmp(cmd, "assert-enabled") == 0) {
        // The enumeration answers for the calling user, which is the point:
        // this asks whether *this* user would see IPAbet in Win+Space.
        TF_INPUTPROCESSORPROFILE p{};
        const int hits = Walk(mgr, false, &p, &total);
        if (hits < 1) {
            fprintf(stderr, "IPAbet is not registered (%d profiles enumerated).\n", total);
            rc = 1;
        } else if (p.dwFlags & TF_IPP_FLAG_ENABLED) {
            printf("IPAbet is enabled for this user under language 0x%04x.\n", p.langid);
            rc = 0;
        } else {
            fprintf(stderr, "IPAbet is registered but NOT in this user's keyboard list "
                            "(flags 0x%lx).\n", (unsigned long)p.dwFlags);
            rc = 1;
        }
    } else if (strcmp(cmd, "enable-select") == 0) {
        TF_INPUTPROCESSORPROFILE p{};
        const int hits = Walk(mgr, false, &p, &total);
        if (hits < 1) {
            fprintf(stderr, "IPAbet is not registered (%d profiles enumerated) — nothing to "
                            "select.\n", total);
            rc = 1;
        } else {
            printf("selecting IPAbet under language 0x%04x of %d registered\n", p.langid, hits);
            // Not TF_IPPMF_FORPROCESS: that would switch the input method for
            // this probe and nothing else, and the point is to leave it active
            // for whatever the session runs next.
            hr = mgr->ActivateProfile(TF_PROFILETYPE_INPUTPROCESSOR, p.langid, p.clsid,
                                      p.guidProfile, nullptr, TF_IPPMF_ENABLEPROFILE);

            // ActivateProfile changes the calling thread, which is gone the
            // moment this exits. What an application started afterwards reads
            // is the user's default profile, so set that too.
            ITfInputProcessorProfiles *legacy = nullptr;
            HRESULT dhr = CoCreateInstance(CLSID_TF_InputProcessorProfiles, nullptr,
                                           CLSCTX_INPROC_SERVER, IID_ITfInputProcessorProfiles,
                                           (void **)&legacy);
            if (SUCCEEDED(dhr)) {
                dhr = legacy->SetDefaultLanguageProfile(p.langid, kService, kProfile);
                HRESULT ahr = legacy->ActivateLanguageProfile(kService, p.langid, kProfile);
                printf("SetDefaultLanguageProfile=0x%08lx ActivateLanguageProfile=0x%08lx\n", dhr,
                       ahr);
                legacy->Release();
            }
            if (SUCCEEDED(hr)) {
                printf("IPAbet is active.\n");
                rc = 0;
            } else {
                fprintf(stderr, "could not activate: 0x%08lx\n", hr);
                rc = 1;
            }
        }
    } else {
        fprintf(stderr, "unknown command: %s\n", cmd);
    }

    mgr->Release();
    CoUninitialize();
    return rc;
}
