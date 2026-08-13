#ifndef IPABET_TSF_IPABET_H
#define IPABET_TSF_IPABET_H

#include <windows.h>
#include <msctf.h>

#include <string>
#include <vector>

extern "C" {
#include "ipabet_engine.h"
}

namespace ipabet {

// Keystroke logging exists only in debug builds. A release build has no logging
// capability at all — an input method sees everything typed, so the ability to
// record it is not something to ship and leave switched off.
#ifdef IPABET_DEBUG
void Dbg(const char *fmt, ...);
#else
#define Dbg(...) ((void)0)
#endif

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
class TextService : public ITfTextInputProcessorEx,
                    public ITfKeyEventSink,
                    public ITfCompositionSink {
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

    // ITfCompositionSink — the client can end a composition without asking,
    // and a pointer kept past that point is a pointer to nothing.
    STDMETHODIMP OnCompositionTerminated(TfEditCookie ec, ITfComposition *composition) override;

    /// Commit what is composed and stop composing. The boundary behaviour for a
    /// key IPAbet declines, and for losing focus.
    void EndComposition(TfEditCookie ec);

    /// Runs one keystroke through the engine and applies what comes back.
    /// Called from the edit session, the only place a cookie exists — reading
    /// the document and writing to it both need one.
    HRESULT HandleKeyInSession(TfEditCookie ec, ITfContext *cx, const CKeystroke &k,
                               bool backspace);

private:
    ~TextService();

    /// The tail of the run as this service wrote it. TSF offers to read the
    /// document back, but reading it here returns nothing usable — so the
    /// service keeps its own record instead, the same way the fcitx5 addon does
    /// for clients that cannot be read at all. Only the last couple of clusters
    /// matter, which is the whole of the engine's lookback.
    std::wstring written_;

    /// Whether IPAbet claims this key. Decided without consulting the engine,
    /// because TSF asks before any edit cookie exists.
    bool Claims(WPARAM wp, LPARAM lp, CKeystroke *out);

    /// TSF hands a text service ordinary typing, but treats Control and Alt
    /// chords as commands and never offers them to the key sink at all — Shift
    /// arrives, Ctrl and Alt do not. A service that wants one has to reserve it
    /// by name, and gets it back through OnPreservedKey rather than OnKeyDown.
    /// This is why the diacritic layer needs registering key by key.
    void PreserveDiacriticKeys();
    void ReleaseDiacriticKeys();

    struct Preserved {
        GUID guid;
        std::string label;
        bool shift;
        UINT modifiers;
    };
    std::vector<Preserved> preserved_;

    /// ⇧ is tracked from every key event, claimed or not: a release between two
    /// keystrokes is what breaks the chain, and TSF only calls OnKeyDown for
    /// keys the service claims — which ⇧ never is.
    void TrackShift(WPARAM wp, bool down);

    /// The armed diacritic, as text to show while it waits for a base. Empty
    /// when nothing is pending.
    std::wstring Preview() const;

    /// The run being typed lives in a composition — a range this service owns
    /// and can rewrite whole. Replacing a glyph means putting different text in
    /// the composition, never moving an anchor backwards over the document,
    /// which is what does not work here.
    HRESULT SetComposition(TfEditCookie ec, ITfContext *cx, const std::wstring &text);

    /// Commit everything the engine can no longer reach, so the composed region
    /// stays a glyph or two rather than growing to the whole line.
    HRESULT Trim(TfEditCookie ec, ITfContext *cx);

    ITfComposition *composition_ = nullptr;

    /// spec/ipabet.json, shipped beside the DLL and read at activation.
    std::string LoadSpec();

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
