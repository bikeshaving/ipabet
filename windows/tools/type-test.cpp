// Types through the real thing: a real edit control, the real text service,
// real keystrokes injected at the bottom of the input stack. If this passes,
// IPAbet works on Windows in the sense a user would recognise.
//
// It is one process on purpose. Activating a text service applies to the
// process that asks, so a probe that activated IPAbet and then typed into a
// separate application would be typing into a window that never had it on.
//
// Usage: type-test.exe            runs the built-in cases
// Exit 0 if every case produced what the engine says it should.

#include <windows.h>
#include <msctf.h>

#include <cstdio>
#include <string>
#include <vector>

namespace {

// Must match tsf/ipabet.cpp.
const CLSID kService = {
    0x6b2e1f0c, 0x9a44, 0x4c3b, {0xb0, 0xd5, 0x1e, 0x7a, 0x2c, 0x5d, 0x8f, 0x31}};
const GUID kProfile = {
    0xc4d9a7e2, 0x3f18, 0x4b6a, {0x9e, 0x52, 0x7a, 0x0b, 0x4d, 0x6c, 0x81, 0x25}};

HWND g_edit = nullptr;

struct Case {
    const wchar_t *name;
    std::vector<std::pair<WORD, bool>> keys; // virtual key, shift held
    const wchar_t *expected;
};

void Pump(int ms) {
    const DWORD until = GetTickCount() + ms;
    MSG msg;
    while (GetTickCount() < until) {
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        Sleep(10);
    }
}

INPUT KeyInput(WORD vk, bool up) {
    INPUT in{};
    in.type = INPUT_KEYBOARD;
    in.ki.wVk = 0;
    // Scancodes, not virtual keys: the text service reads the physical key, and
    // KEYEVENTF_UNICODE would skip the layout and the text services entirely.
    in.ki.wScan = (WORD)MapVirtualKeyW(vk, MAPVK_VK_TO_VSC);
    in.ki.dwFlags = KEYEVENTF_SCANCODE | (up ? KEYEVENTF_KEYUP : 0);
    return in;
}

void SendKey(WORD vk, bool shift) {
    std::vector<INPUT> seq;
    if (shift) seq.push_back(KeyInput(VK_SHIFT, false));
    seq.push_back(KeyInput(vk, false));
    seq.push_back(KeyInput(vk, true));
    if (shift) seq.push_back(KeyInput(VK_SHIFT, true));
    SendInput((UINT)seq.size(), seq.data(), sizeof(INPUT));
    Pump(120);
}

bool TakeForeground(HWND hwnd) {
    SystemParametersInfoW(SPI_SETFOREGROUNDLOCKTIMEOUT, 0, nullptr, 0);
    for (int i = 0; i < 50; i++) {
        if (GetForegroundWindow() == hwnd) return true;
        ShowWindow(hwnd, SW_RESTORE);
        SetForegroundWindow(hwnd);
        Pump(100);
    }
    return GetForegroundWindow() == hwnd;
}

std::string Narrow(const std::wstring &w) {
    int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string s(n ? n - 1 : 0, '\0');
    WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, s.data(), n, nullptr, nullptr);
    return s;
}

LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    if (msg == WM_DESTROY) {
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

} // namespace

int main() {
    if (FAILED(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED))) return 2;

    WNDCLASSW wc{};
    wc.lpfnWndProc = WndProc;
    wc.hInstance = GetModuleHandleW(nullptr);
    wc.lpszClassName = L"IpabetTypeTest";
    RegisterClassW(&wc);

    HWND host = CreateWindowExW(WS_EX_TOPMOST, L"IpabetTypeTest", L"ipabet-type-test",
                                WS_OVERLAPPEDWINDOW, 100, 100, 640, 200, nullptr, nullptr,
                                wc.hInstance, nullptr);
    g_edit = CreateWindowExW(0, L"EDIT", L"", WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL, 10, 10, 600,
                             30, host, nullptr, wc.hInstance, nullptr);
    ShowWindow(host, SW_SHOW);
    Pump(300);

    ITfInputProcessorProfileMgr *mgr = nullptr;
    HRESULT hr = CoCreateInstance(CLSID_TF_InputProcessorProfiles, nullptr, CLSCTX_INPROC_SERVER,
                                  IID_ITfInputProcessorProfileMgr, (void **)&mgr);
    if (FAILED(hr)) {
        fprintf(stderr, "no profile manager: 0x%08lx\n", hr);
        return 2;
    }
    hr = mgr->ActivateProfile(TF_PROFILETYPE_INPUTPROCESSOR,
                              MAKELANGID(LANG_ENGLISH, SUBLANG_ENGLISH_US), kService, kProfile,
                              nullptr, TF_IPPMF_FORPROCESS | TF_IPPMF_ENABLEPROFILE);
    printf("ActivateProfile returned 0x%08lx\n", hr);
    mgr->Release();
    if (FAILED(hr)) return 1;
    Pump(500);

    if (!TakeForeground(host)) {
        fprintf(stderr, "could not take the foreground\n");
        return 2;
    }
    SetFocus(g_edit);
    Pump(200);

    // Sequences chosen to exercise the parts that are not a plain letter: a
    // digraph that rewrites what came before, and a digit base that only works
    // if the passed-through character stayed in the document.
    const std::vector<Case> cases = {
        {L"t + shift-H -> theta", {{'T', false}, {'H', true}}, L"θ"},
        {L"s + shift-H -> esh", {{'S', false}, {'H', true}}, L"ʃ"},
        {L"5 + shift-H -> schwa", {{'5', false}, {'H', true}}, L"ə"},
        {L"plain letters", {{'M', false}, {'A', false}}, L"ma"},
    };

    int failures = 0;
    for (const Case &c : cases) {
        SetWindowTextW(g_edit, L"");
        Pump(150);
        for (const auto &k : c.keys) SendKey(k.first, k.second);
        Pump(400);

        wchar_t buf[256]{};
        GetWindowTextW(g_edit, buf, 256);
        const std::wstring got = buf;
        const bool ok = got == c.expected;
        if (!ok) failures++;
        printf("%s %ls: expected '%s' got '%s'\n", ok ? "PASS" : "FAIL", c.name,
               Narrow(c.expected).c_str(), Narrow(got).c_str());
    }

    DestroyWindow(host);
    CoUninitialize();
    printf("%zu cases, %d failed\n", cases.size(), failures);
    return failures ? 1 : 0;
}
