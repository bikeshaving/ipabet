// The Windows side of IPAbet: it owns no phonetics of its own. Every decision
// about what a keystroke means comes back from the Rust engine in engine/ (the
// same crate the fcitx5 addon links), reached through its C ABI; this file only
// translates TSF key events into the engine's keystroke shape and turns the
// edit it hands back into document text.
//
// Composition model: edits go straight into the document. TSF can walk back
// from the selection and read what is already there, which is the lookback the
// engine needs, so there is nothing to shadow in a composition buffer — the
// fcitx5 addon keeps one only because its clients cannot be read back.
//
// Keys are claimed on the way in. TSF asks whether a key will be eaten before
// any edit cookie exists, so the engine cannot be consulted at that point; a
// key on IPAbet's plane is claimed, and if the engine turns out to pass on it,
// the text service inserts the character the key would have produced.

#include "ipabet.h"
#include "uslayout.h"

#include <string>
#include <vector>

namespace ipabet {

// {6B2E1F0C-9A44-4C3B-B0D5-1E7A2C5D8F31}
const CLSID CLSID_IpabetTextService = {
    0x6b2e1f0c, 0x9a44, 0x4c3b, {0xb0, 0xd5, 0x1e, 0x7a, 0x2c, 0x5d, 0x8f, 0x31}};
// {C4D9A7E2-3F18-4B6A-9E52-7A0B4D6C8125}
const GUID GUID_IpabetProfile = {
    0xc4d9a7e2, 0x3f18, 0x4b6a, {0x9e, 0x52, 0x7a, 0x0b, 0x4d, 0x6c, 0x81, 0x25}};

namespace {

HINSTANCE g_module = nullptr;
LONG g_objects = 0;

std::string ToUtf8(const std::wstring &w) {
    if (w.empty()) return {};
    int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), nullptr, 0, nullptr, nullptr);
    std::string s(n, '\0');
    WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), s.data(), n, nullptr, nullptr);
    return s;
}

std::wstring ToUtf16(const char *utf8) {
    if (!utf8 || !*utf8) return {};
    int n = MultiByteToWideChar(CP_UTF8, 0, utf8, -1, nullptr, 0);
    std::wstring w(n ? n - 1 : 0, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, utf8, -1, w.data(), n);
    return w;
}

/// The engine counts a replacement in codepoints; a UTF-16 document counts in
/// code units, and the two disagree on every astral character. Walk back the
/// requested number of codepoints and report how many units that covered.
LONG Utf16UnitsForCodepoints(const std::wstring &text, LONG codepoints) {
    LONG units = 0;
    size_t i = text.size();
    for (LONG n = 0; n < codepoints && i > 0; n++) {
        i--;
        units++;
        if (i > 0 && (text[i] & 0xFC00) == 0xDC00 && (text[i - 1] & 0xFC00) == 0xD800) {
            i--;
            units++;
        }
    }
    return units;
}

/// One keystroke, run inside an edit session because reading the document and
/// writing to it both need a cookie TSF only hands out here.
class KeyEditSession : public ITfEditSession {
public:
    KeyEditSession(TextService *ts, ITfContext *cx, const CKeystroke &k, bool backspace)
        : ts_(ts), cx_(cx), key_(k.key ? k.key : ""), k_(k), backspace_(backspace) {
        k_.key = key_.c_str();
        cx_->AddRef();
    }

    STDMETHODIMP QueryInterface(REFIID riid, void **ppv) override {
        if (!ppv) return E_INVALIDARG;
        *ppv = nullptr;
        if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_ITfEditSession)) {
            *ppv = static_cast<ITfEditSession *>(this);
            AddRef();
            return S_OK;
        }
        return E_NOINTERFACE;
    }
    STDMETHODIMP_(ULONG) AddRef() override { return ++refs_; }
    STDMETHODIMP_(ULONG) Release() override {
        LONG n = --refs_;
        if (!n) delete this;
        return n;
    }

    STDMETHODIMP DoEditSession(TfEditCookie ec) override {
        return ts_->HandleKeyInSession(ec, cx_, k_, backspace_);
    }

private:
    ~KeyEditSession() { cx_->Release(); }

    LONG refs_ = 1;
    TextService *ts_;
    ITfContext *cx_;
    std::string key_;
    CKeystroke k_;
    bool backspace_;
};

/// Ends the composition and nothing else. Committing needs a cookie too, and a
/// key IPAbet declines is exactly when the run has to be handed over.
class CommitEditSession : public ITfEditSession {
public:
    CommitEditSession(TextService *ts) : ts_(ts) {}

    STDMETHODIMP QueryInterface(REFIID riid, void **ppv) override {
        if (!ppv) return E_INVALIDARG;
        *ppv = nullptr;
        if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_ITfEditSession)) {
            *ppv = static_cast<ITfEditSession *>(this);
            AddRef();
            return S_OK;
        }
        return E_NOINTERFACE;
    }
    STDMETHODIMP_(ULONG) AddRef() override { return ++refs_; }
    STDMETHODIMP_(ULONG) Release() override {
        LONG n = --refs_;
        if (!n) delete this;
        return n;
    }

    STDMETHODIMP DoEditSession(TfEditCookie ec) override {
        ts_->EndComposition(ec);
        return S_OK;
    }

private:
    LONG refs_ = 1;
    TextService *ts_;
};

} // namespace

// --- TextService -----------------------------------------------------------

TextService::TextService() { InterlockedIncrement(&g_objects); }

TextService::~TextService() {
    if (engine_) ipabet_engine_free(engine_);
    InterlockedDecrement(&g_objects);
}

STDMETHODIMP TextService::QueryInterface(REFIID riid, void **ppv) {
    if (!ppv) return E_INVALIDARG;
    *ppv = nullptr;
    if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_ITfTextInputProcessor)) {
        *ppv = static_cast<ITfTextInputProcessor *>(this);
    } else if (IsEqualIID(riid, IID_ITfTextInputProcessorEx)) {
        *ppv = static_cast<ITfTextInputProcessorEx *>(this);
    } else if (IsEqualIID(riid, IID_ITfKeyEventSink)) {
        *ppv = static_cast<ITfKeyEventSink *>(this);
    } else {
        return E_NOINTERFACE;
    }
    AddRef();
    return S_OK;
}

STDMETHODIMP_(ULONG) TextService::AddRef() { return InterlockedIncrement(&refs_); }

STDMETHODIMP_(ULONG) TextService::Release() {
    LONG n = InterlockedDecrement(&refs_);
    if (!n) delete this;
    return n;
}

STDMETHODIMP TextService::Activate(ITfThreadMgr *mgr, TfClientId id) {
    return ActivateEx(mgr, id, 0);
}

STDMETHODIMP TextService::ActivateEx(ITfThreadMgr *mgr, TfClientId id, DWORD) {
    Dbg("ActivateEx client=%u", (unsigned)id);
    thread_ = mgr;
    thread_->AddRef();
    client_ = id;

    // A spec that fails to load is a packaging fault, not a runtime state to
    // recover from — without it every key is declined rather than eaten.
    const std::string spec = LoadSpec();
    if (!spec.empty()) engine_ = ipabet_engine_new(spec.c_str());
    Dbg("spec %zu bytes, engine %s", spec.size(), engine_ ? "up" : "MISSING");

    ITfKeystrokeMgr *keys = nullptr;
    if (SUCCEEDED(thread_->QueryInterface(IID_ITfKeystrokeMgr, (void **)&keys))) {
        keys->AdviseKeyEventSink(client_, static_cast<ITfKeyEventSink *>(this), TRUE);
        keys->Release();
    }
    return S_OK;
}

STDMETHODIMP TextService::Deactivate() {
    if (thread_) {
        ITfKeystrokeMgr *keys = nullptr;
        if (SUCCEEDED(thread_->QueryInterface(IID_ITfKeystrokeMgr, (void **)&keys))) {
            keys->UnadviseKeyEventSink(client_);
            keys->Release();
        }
        thread_->Release();
        thread_ = nullptr;
    }
    if (composition_) {
        composition_->Release();
        composition_ = nullptr;
    }
    if (engine_) {
        ipabet_engine_free(engine_);
        engine_ = nullptr;
    }
    written_.clear();
    pending_ = CPending{};
    chainBroken_ = false;
    return S_OK;
}

STDMETHODIMP TextService::OnSetFocus(BOOL) {
    // Focus moved: neither an armed diacritic nor what was typed before carries
    // across documents.
    written_.clear();
    pending_ = CPending{};
    chainBroken_ = false;
    shiftDown_ = false;
    shiftBroke_ = false;
    return S_OK;
}

/// Whether IPAbet claims this key, decided without the engine because TSF asks
/// before any edit cookie exists.
bool TextService::Claims(WPARAM wp, LPARAM lp, CKeystroke *out) {
    if (!engine_) return false;
    if (GetKeyState(VK_LWIN) < 0 || GetKeyState(VK_RWIN) < 0) return false;

    const bool ctrl = GetKeyState(VK_CONTROL) < 0;
    const unsigned scancode = (unsigned)((lp >> 16) & 0xFF);

    std::string label;
    if (wp == VK_ESCAPE) {
        label = "Escape";
    } else if (wp == VK_BACK) {
        // Backspace only when a mark is armed and there is something to peel:
        // otherwise the host's own deletion is the right behaviour, and eating
        // the key to reproduce it would be a worse version of it.
        if (pending_.count == 0) return false;
    } else {
        if (ctrl) return false;
        label = usLayoutLabel(scancode);
        if (label.empty()) return false;
    }

    if (out) {
        *out = CKeystroke{};
        out->shift = GetKeyState(VK_SHIFT) < 0;
        out->option = GetKeyState(VK_MENU) < 0;
        out->control = ctrl;
        out->caps_lock = (GetKeyState(VK_CAPITAL) & 1) != 0;
        out->shift_broke = shiftBroke_;
    }
    return true;
}

STDMETHODIMP TextService::OnTestKeyDown(ITfContext *, WPARAM wp, LPARAM lp, BOOL *eaten) {
    *eaten = Claims(wp, lp, nullptr) ? TRUE : FALSE;
    return S_OK;
}

STDMETHODIMP TextService::OnKeyDown(ITfContext *cx, WPARAM wp, LPARAM lp, BOOL *eaten) {
    Dbg("OnKeyDown vk=0x%02x scan=0x%02x", (unsigned)wp, (unsigned)((lp >> 16) & 0xFF));
    if (wp == VK_SHIFT) {
        shiftDown_ = true;
        *eaten = FALSE;
        return S_OK;
    }

    CKeystroke k{};
    if (!Claims(wp, lp, &k)) {
        // The run ends at a key IPAbet does not claim: hand over what is
        // composed before the client sees the key itself.
        if (composition_) {
            CommitEditSession *commit = new CommitEditSession(this);
            HRESULT chr = S_OK;
            cx->RequestEditSession(client_, commit, TF_ES_READWRITE | TF_ES_SYNC, &chr);
            commit->Release();
        }
        written_.clear();
        *eaten = FALSE;
        return S_OK;
    }

    const unsigned scancode = (unsigned)((lp >> 16) & 0xFF);
    std::string label = wp == VK_ESCAPE ? "Escape" : (wp == VK_BACK ? "" : usLayoutLabel(scancode));
    k.key = label.c_str();
    shiftBroke_ = false;

    KeyEditSession *session = new KeyEditSession(this, cx, k, wp == VK_BACK);
    HRESULT hr = S_OK;
    HRESULT req = cx->RequestEditSession(client_, session, TF_ES_READWRITE | TF_ES_SYNC, &hr);
    Dbg("RequestEditSession req=0x%08lx session=0x%08lx", req, hr);
    session->Release();

    *eaten = TRUE;
    return S_OK;
}

STDMETHODIMP TextService::OnTestKeyUp(ITfContext *, WPARAM wp, LPARAM, BOOL *eaten) {
    *eaten = FALSE;
    if (wp == VK_SHIFT && shiftDown_) {
        shiftBroke_ = true;
        shiftDown_ = false;
    }
    return S_OK;
}

STDMETHODIMP TextService::OnKeyUp(ITfContext *, WPARAM, LPARAM, BOOL *eaten) {
    *eaten = FALSE;
    return S_OK;
}

STDMETHODIMP TextService::OnPreservedKey(ITfContext *, REFGUID, BOOL *eaten) {
    *eaten = FALSE;
    return S_OK;
}


HRESULT TextService::SetComposition(TfEditCookie ec, ITfContext *cx, const std::wstring &text) {
    if (!composition_) {
        // The composition starts where the caret is. The selection range is the
        // simplest way to say that, and it is a range the context already
        // vouches for.
        TF_SELECTION sel{};
        ULONG fetched = 0;
        HRESULT hr = cx->GetSelection(ec, TF_DEFAULT_SELECTION, 1, &sel, &fetched);
        if (FAILED(hr) || !fetched) {
            Dbg("start: GetSelection=0x%08lx fetched=%lu", hr, fetched);
            return FAILED(hr) ? hr : E_FAIL;
        }

        ITfContextComposition *comp = nullptr;
        hr = cx->QueryInterface(IID_ITfContextComposition, (void **)&comp);
        if (SUCCEEDED(hr)) {
            hr = comp->StartComposition(ec, sel.range, nullptr, &composition_);
            comp->Release();
        }
        sel.range->Release();
        Dbg("start: StartComposition=0x%08lx composition=%p", hr, (void *)composition_);
        if (FAILED(hr) || !composition_) return FAILED(hr) ? hr : E_FAIL;
    }

    ITfRange *range = nullptr;
    HRESULT hr = composition_->GetRange(&range);
    if (FAILED(hr)) return hr;
    hr = range->SetText(ec, 0, text.c_str(), (LONG)text.size());
    Dbg("composition now %zu units, SetText=0x%08lx", text.size(), hr);

    // The caret belongs after what has been typed, not inside it.
    TF_SELECTION sel{};
    sel.range = range;
    sel.style.ase = TF_AE_END;
    sel.style.fInterimChar = FALSE;
    ITfRange *caret = nullptr;
    if (SUCCEEDED(range->Clone(&caret))) {
        caret->Collapse(ec, TF_ANCHOR_END);
        sel.range = caret;
        cx->SetSelection(ec, 1, &sel);
        caret->Release();
    }
    range->Release();
    return hr;
}

void TextService::EndComposition(TfEditCookie ec) {
    if (!composition_) return;
    composition_->EndComposition(ec);
    composition_->Release();
    composition_ = nullptr;
    written_.clear();
}

HRESULT TextService::Trim(TfEditCookie ec, ITfContext *cx) {
    // Two grapheme clusters is the whole of the engine's lookback. Anything
    // older can be committed, and committing it is what keeps the underline
    // short. Ending the composition commits whatever it holds, so the head goes
    // in first and a fresh composition picks the tail back up.
    const size_t keep = 4;
    if (written_.size() <= keep) return S_OK;

    const std::wstring head = written_.substr(0, written_.size() - keep);
    const std::wstring tail = written_.substr(written_.size() - keep);
    HRESULT hr = SetComposition(ec, cx, head);
    if (FAILED(hr)) return hr;
    EndComposition(ec);
    written_ = tail;
    return SetComposition(ec, cx, tail);
}

HRESULT TextService::HandleKeyInSession(TfEditCookie ec, ITfContext *cx, const CKeystroke &k,
                                        bool backspace) {
    const std::wstring &before = written_;
    Dbg("lookback %zu units", before.size());
    const std::string beforeUtf8 = ToUtf8(before);

    CStep step = backspace
                     ? ipabet_engine_handle_backspace(engine_, beforeUtf8.c_str(), pending_)
                     : ipabet_engine_handle_key(engine_, beforeUtf8.c_str(), k, pending_, chainBroken_);

    pending_ = step.pending;
    if (step.has_chain_broken) chainBroken_ = step.chain_broken;

    std::wstring text;
    LONG replaceUnits = 0;
    switch (step.edit.edit_type) {
    case Insert:
        text = ToUtf16(step.edit.text);
        break;
    case Replace:
        text = ToUtf16(step.edit.text);
        replaceUnits = Utf16UnitsForCodepoints(before, step.edit.replace_length);
        break;
    case Pass: {
        // The key was claimed before the engine had a say, so its own character
        // is this text service's to insert.
        char native[EDIT_TEXT_MAX];
        ipabet_native_char(k, native, sizeof(native));
        text = ToUtf16(native);
        break;
    }
    default: // Noop: only the pending composition moved
        return S_OK;
    }
    // Keep the record in step with what is composed. Two grapheme clusters is
    // the whole of the engine's lookback, so anything older is dead weight.
    if (replaceUnits > 0 && (size_t)replaceUnits <= written_.size()) {
        written_.resize(written_.size() - replaceUnits);
    } else if (replaceUnits > 0) {
        written_.clear();
    }
    written_ += text;

    HRESULT hr = SetComposition(ec, cx, written_);
    if (FAILED(hr)) return hr;
    return Trim(ec, cx);
}

} // namespace ipabet
