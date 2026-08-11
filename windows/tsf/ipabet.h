#ifndef IPABET_TSF_IPABET_H
#define IPABET_TSF_IPABET_H

#include <windows.h>
#include <msctf.h>

#include <string>

extern "C" {
#include "ipabet_engine.h"
}

namespace ipabet {

// {6B2E1F0C-9A44-4C3B-B0D5-1E7A2C5D8F31} — the text service's class id, and the
// name every registry key and profile entry is filed under.
extern const CLSID CLSID_IpabetTextService;
// {C4D9A7E2-3F18-4B6A-9E52-7A0B4D6C8125} — the language profile within it.
extern const GUID GUID_IpabetProfile;

HRESULT RegisterServer(HINSTANCE module);
HRESULT UnregisterServer();

/// The text service. TSF hands it keystrokes through ITfKeyEventSink and it
/// answers by editing the document through an edit session — the engine decides
/// what the answer is.
class TextService : public ITfTextInputProcessorEx, public ITfKeyEventSink {
public:
    TextService();

    // IUnknown
    STDMETHODIMP QueryInterface(REFIID riid, void **ppv) override;
    STDMETHODIMP_(ULONG) AddRef() override;
    STDMETHODIMP_(ULONG) Release() override;

    // ITfTextInputProcessor / Ex
    STDMETHODIMP Activate(ITfThreadMgr *mgr, TfClientId id) override;
    STDMETHODIMP ActivateEx(ITfThreadMgr *mgr, TfClientId id, DWORD flags) override;
    STDMETHODIMP Deactivate() override;

    // ITfKeyEventSink
    STDMETHODIMP OnSetFocus(BOOL foreground) override;
    STDMETHODIMP OnTestKeyDown(ITfContext *cx, WPARAM wp, LPARAM lp, BOOL *eaten) override;
    STDMETHODIMP OnKeyDown(ITfContext *cx, WPARAM wp, LPARAM lp, BOOL *eaten) override;
    STDMETHODIMP OnTestKeyUp(ITfContext *cx, WPARAM wp, LPARAM lp, BOOL *eaten) override;
    STDMETHODIMP OnKeyUp(ITfContext *cx, WPARAM wp, LPARAM lp, BOOL *eaten) override;
    STDMETHODIMP OnPreservedKey(ITfContext *cx, REFGUID guid, BOOL *eaten) override;

    /// Runs one keystroke through the engine and applies what comes back.
    /// Called from the edit session, the only place a cookie exists — reading
    /// the document and writing to it both need one.
    HRESULT HandleKeyInSession(TfEditCookie ec, ITfContext *cx, const CKeystroke &k,
                               bool backspace);

private:
    ~TextService();

    /// Whether IPAbet claims this key. Decided without consulting the engine,
    /// because TSF asks before any edit cookie exists.
    bool Claims(WPARAM wp, LPARAM lp, CKeystroke *out);

    /// spec/ipabet.json, shipped beside the DLL and read at activation.
    std::string LoadSpec();

    /// The engine's whole lookback, read straight out of the document: TSF can
    /// walk backwards from the selection, so unlike the fcitx5 addon there is no
    /// need to shadow the text in a composition buffer.
    std::wstring TextBefore(TfEditCookie ec, ITfContext *cx, LONG count);

    LONG refs_ = 1;
    ITfThreadMgr *thread_ = nullptr;
    TfClientId client_ = TF_CLIENTID_NULL;
    Engine *engine_ = nullptr;

    CPending pending_{};
    bool chainBroken_ = false;
    // A physical ⇧ release between two keystrokes breaks the chain, which is
    // what stops an acronym from rebasing into IPA.
    bool shiftDown_ = false;
    bool shiftBroke_ = false;
};

} // namespace ipabet

#endif // IPABET_TSF_IPABET_H
