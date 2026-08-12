// Registers IPAbet, or takes it back out with --disable.
//
// The DLL registers itself — this only asks it to, from beside it. That keeps
// one implementation of what registration means rather than a second copy of it
// in the installer, and gives the installer something to call that reports a
// real exit code, which regsvr32 does not under automation.
//
// Needs administrator rights: the profile is machine-wide.
//
// Exit 0 on success, 1 if registration failed, 2 if it could not be attempted.

#include <windows.h>

#include <cstdio>
#include <cstring>
#include <string>

namespace {

std::wstring DllBesideMe() {
    WCHAR path[MAX_PATH]{};
    GetModuleFileNameW(nullptr, path, MAX_PATH);
    std::wstring s = path;
    const size_t slash = s.find_last_of(L'\\');
    if (slash != std::wstring::npos) s.resize(slash + 1);
    return s + L"ipabet.dll";
}

} // namespace

int wmain(int argc, wchar_t **argv) {
    bool disable = false;
    if (argc == 2 && wcscmp(argv[1], L"--disable") == 0) {
        disable = true;
    } else if (argc != 1) {
        fwprintf(stderr, L"usage: ipabet-register [--disable]\n");
        return 2;
    }

    if (FAILED(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED))) return 2;

    const std::wstring dll = DllBesideMe();
    HMODULE module = LoadLibraryW(dll.c_str());
    if (!module) {
        fwprintf(stderr, L"cannot load %ls: %lu\n", dll.c_str(), GetLastError());
        CoUninitialize();
        return 2;
    }

    typedef HRESULT(STDAPICALLTYPE * Fn)();
    const char *entry = disable ? "DllUnregisterServer" : "DllRegisterServer";
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
    wprintf(disable ? L"IPAbet removed.\n"
                    : L"IPAbet installed. Pick it from the language bar to start typing.\n");
    return 0;
}
