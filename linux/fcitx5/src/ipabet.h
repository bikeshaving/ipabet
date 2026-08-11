#ifndef IPABET_FCITX5_IPABET_H
#define IPABET_FCITX5_IPABET_H

#include <fcitx-utils/key.h>
#include <fcitx/addonfactory.h>
#include <fcitx/addoninstance.h>
#include <fcitx/addonmanager.h>
#include <fcitx/inputcontextproperty.h>
#include <fcitx/inputmethodengine.h>
#include <fcitx/instance.h>

#include <string>

extern "C" {
#include "ipabet_engine.h"
}

namespace ipabet {

/// Per-input-context typing state. `buffer` is the tail of the run the user
/// is typing that has NOT been committed to the client yet — it is what the
/// engine sees as `text_before`, and it doubles as the preedit. Only the last
/// couple of clusters ever live here (see IpabetEngine::trim), because that is
/// the whole of the engine's lookback.
class IpabetState : public fcitx::InputContextProperty {
public:
    CPending pending{};
    bool chainBroken = false;
    std::string buffer;

    void clear() {
        pending = CPending{};
        chainBroken = false;
        buffer.clear();
    }
};

class IpabetEngine : public fcitx::InputMethodEngineV2 {
public:
    explicit IpabetEngine(fcitx::Instance *instance);
    ~IpabetEngine() override;

    void keyEvent(const fcitx::InputMethodEntry &entry,
                  fcitx::KeyEvent &event) override;
    void reset(const fcitx::InputMethodEntry &entry,
               fcitx::InputContextEvent &event) override;

private:
    /// Push `buffer` into the client and drop everything pending — the
    /// boundary behaviour for a key IPAbet declines, and for losing focus.
    void flush(fcitx::InputContext *ic, IpabetState *state);
    /// Commit everything the engine can no longer reach, keeping only the
    /// trailing clusters its lookback needs, so the underlined region stays
    /// a character or two rather than growing to the whole word.
    void trim(fcitx::InputContext *ic, IpabetState *state);
    void updatePreedit(fcitx::InputContext *ic, IpabetState *state);

    fcitx::Instance *instance_;
    Engine *engine_ = nullptr;
    fcitx::FactoryFor<IpabetState> factory_;

    // Shift-release tracking: a physical ⇧ release between two keystrokes
    // breaks the chain, which is what stops an acronym from rebasing into IPA.
    bool shiftDown_ = false;
    bool shiftBroke_ = false;
};

class IpabetEngineFactory : public fcitx::AddonFactory {
public:
    fcitx::AddonInstance *create(fcitx::AddonManager *manager) override {
        return new IpabetEngine(manager->instance());
    }
};

} // namespace ipabet

#endif // IPABET_FCITX5_IPABET_H
