// Registers IPAbet and puts it in the user's keyboard list, or takes both back
// out with --disable.
//
// Two halves, because Windows splits them. Registration is machine-wide: the
// profile exists, filed under English (US), and needs administrator rights.
// Enablement is per-user: the English (US) + IPAbet pair joins the calling
// user's Win+Space list, whether or not that user has English (US) otherwise —
// enabling the pair is what adds it. A registered but never-enabled service is
// invisible, which is what "installed but nothing appeared" looks like.
//
// The DLL registers itself — the machine half only asks it to, from beside it.
// That keeps one implementation of what registration means rather than a second
// copy of it in the installer, and gives the installer something to call that
// reports a real exit code, which regsvr32 does not under automation.
//
// The MSI runs the halves separately, because they need different accounts:
// --register and --unregister as SYSTEM, --enable and --unenable impersonated
// as the installing user. Without arguments this does both, for a human at an
// elevated prompt.
//
// Exit 0 on success, 1 if a step failed, 2 if it could not be attempted.

#include <windows.h>

#include <cstdio>
#include <cstring>
#include <string>

namespace {

// English (US) : service CLSID : profile GUID — must match tsf/ipabet.cpp and
// the language in tsf/dllmain.cpp. This is the string InstallLayoutOrTip
// takes; there is no richer form of the call.
const WCHAR kTipPair[] =
    L"0x0409:{6B2E1F0C-9A44-4C3B-B0D5-1E7A2C5D8F31}{C4D9A7E2-3F18-4B6A-9E52-7A0B4D6C8125}";

#ifndef ILOT_UNINSTALL
#define ILOT_UNINSTALL 0x00000001
#endif

std::wstring DllBesideMe() {
    WCHAR path[MAX_PATH]{};
    GetModuleFileNameW(nullptr, path, MAX_PATH);
    std::wstring s = path;
    const size_t slash = s.find_last_of(L'\\');
    if (slash != std::wstring::npos) s.resize(slash + 1);
    return s + L"ipabet.dll";
}

/// The machine half: DllRegisterServer or DllUnregisterServer.
int MachineHalf(bool unregister) {
    if (FAILED(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED))) return 2;

    const std::wstring dll = DllBesideMe();
    HMODULE module = LoadLibraryW(dll.c_str());
    if (!module) {
        fwprintf(stderr, L"cannot load %ls: %lu\n", dll.c_str(), GetLastError());
        CoUninitialize();
        return 2;
    }

    typedef HRESULT(STDAPICALLTYPE * Fn)();
    const char *entry = unregister ? "DllUnregisterServer" : "DllRegisterServer";
    Fn fn = (Fn)GetProcAddress(module, entry);
    if (!fn) {
        fwprintf(stderr, L"%hs is not exported\n", entry);
        FreeLibrary(module);
        CoUninitialize();
        return 2;
    }

    const HRESULT hr = fn();
    FreeLibrary(module);
    CoUninitialize();

    if (FAILED(hr)) {
        fwprintf(stderr, L"%hs failed: 0x%08lx\n", entry, hr);
        return 1;
    }
    return 0;
}

/// The user half: add or remove the pair in the calling user's keyboard list.
/// InstallLayoutOrTip lives in input.dll and is loaded by hand — it has no
/// import library.
int UserHalf(bool remove) {
    HMODULE input = LoadLibraryW(L"input.dll");
    if (!input) {
        fwprintf(stderr, L"cannot load input.dll: %lu\n", GetLastError());
        return 2;
    }
    typedef BOOL(WINAPI * Fn)(LPCWSTR, DWORD);
    Fn fn = (Fn)GetProcAddress(input, "InstallLayoutOrTip");
    if (!fn) {
        fwprintf(stderr, L"InstallLayoutOrTip is not exported\n");
        FreeLibrary(input);
        return 2;
    }
    const BOOL ok = fn(kTipPair, remove ? ILOT_UNINSTALL : 0);
    FreeLibrary(input);
    if (!ok) {
        fwprintf(stderr, L"InstallLayoutOrTip(%ls) failed\n",
                 remove ? L"remove" : L"add");
        return 1;
    }
    return 0;
}

} // namespace

int wmain(int argc, wchar_t **argv) {
    const wchar_t *mode = argc == 2 ? argv[1] : L"";
    if (argc > 2 ||
        (argc == 2 && wcscmp(mode, L"--disable") != 0 && wcscmp(mode, L"--register") != 0 &&
         wcscmp(mode, L"--unregister") != 0 && wcscmp(mode, L"--enable") != 0 &&
         wcscmp(mode, L"--unenable") != 0)) {
        fwprintf(stderr, L"usage: ipabet-register [--disable]\n"
                         L"       ipabet-register --register|--unregister    (machine half)\n"
                         L"       ipabet-register --enable|--unenable        (user half)\n");
        return 2;
    }

    if (wcscmp(mode, L"--register") == 0) return MachineHalf(false);
    if (wcscmp(mode, L"--unregister") == 0) return MachineHalf(true);
    if (wcscmp(mode, L"--enable") == 0) return UserHalf(false);
    if (wcscmp(mode, L"--unenable") == 0) return UserHalf(true);

    if (wcscmp(mode, L"--disable") == 0) {
        // The user half first, while there is still a profile to point at.
        const int user = UserHalf(true);
        const int machine = MachineHalf(true);
        if (machine != 0) return machine;
        if (user != 0) return user;
        wprintf(L"IPAbet removed.\n");
        return 0;
    }

    const int machine = MachineHalf(false);
    if (machine != 0) return machine;
    const int user = UserHalf(false);
    if (user != 0) return user;
    wprintf(L"IPAbet installed. Win+Space to switch to it.\n");
    return 0;
}
