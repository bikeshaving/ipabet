import Foundation

// Drives the Rust engine crate through its C ABI from Swift, replaying the whole
// parity + fuzz corpus exactly as engine/tests/parity.rs does. This is the
// acceptance test for re-shelling InputController onto the Rust core: it proves
// the core is faithfully callable from Swift across every recorded case, with no
// skips — unlike the mock-client harness (main.swift), this speaks to the engine
// directly, so shiftBroke is just a keystroke field and nothing is impedance-
// mismatched.
//
//   swiftc -import-objc-header ../engine/include/ipabet_engine.h \
//     -L ../engine/target/release -lipabet_engine tests/rustcore.swift -o rc
//   IPABET_VECTORS=../spec/parity-vectors.json ./rc

struct RawKey: Decodable {
    let key: String
    var shift = false, option = false, control = false, capsLock = false, shiftBroke = false
    enum CodingKeys: String, CodingKey { case key, shift, option, control, capsLock, shiftBroke }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        shift = (try? c.decode(Bool.self, forKey: .shift)) ?? false
        option = (try? c.decode(Bool.self, forKey: .option)) ?? false
        control = (try? c.decode(Bool.self, forKey: .control)) ?? false
        capsLock = (try? c.decode(Bool.self, forKey: .capsLock)) ?? false
        shiftBroke = (try? c.decode(Bool.self, forKey: .shiftBroke)) ?? false
    }
}
struct Vector: Decodable {
    let keys: [RawKey]
    let initial: String
    let expected: String
    let locale: String
    let capital_digraphs: Bool
}

func emptyPending() -> CPending { var p = CPending(); p.count = 0; return p }

func applyEdit(_ before: String, _ edit: CEdit, _ native: String) -> String {
    var e = edit
    var out = [CChar](repeating: 0, count: 256)
    before.withCString { b in native.withCString { n in
        withUnsafePointer(to: &e) { ep in ipabet_apply_edit(b, ep, n, &out, 256) }
    }}
    return String(cString: out)
}

func nativeChar(_ ks: CKeystroke) -> String {
    var out = [CChar](repeating: 0, count: 16)
    ipabet_native_char(ks, &out, 16)
    return String(cString: out)
}

func commitString(_ engine: OpaquePointer, _ pending: CPending) -> String {
    var out = [CChar](repeating: 0, count: 256)
    ipabet_commit_string(engine, pending, &out, 256)
    return String(cString: out)
}

func dropLastClusterBytes(_ text: String) -> String {
    let n = Int(text.withCString { ipabet_last_cluster_byte_len($0) })
    if n == 0 { return text }
    var bytes = Array(text.utf8)
    bytes.removeLast(min(n, bytes.count))
    return String(decoding: bytes, as: UTF8.self)
}

let path = ProcessInfo.processInfo.environment["IPABET_VECTORS"] ?? "../spec/parity-vectors.json"
guard let data = FileManager.default.contents(atPath: path),
      let vectors = try? JSONDecoder().decode([Vector].self, from: data) else {
    FileHandle.standardError.write("cannot read \(path)\n".data(using: .utf8)!)
    exit(2)
}
let spec = try! String(contentsOfFile: "../spec/ipabet.json", encoding: .utf8)
guard let engine = spec.withCString({ ipabet_engine_new($0) }) else { fatalError("engine did not parse") }

var pass = 0
var failures: [String] = []
for v in vectors {
    v.locale.withCString { ipabet_engine_set_quote_locale(engine, $0) }
    ipabet_engine_set_capital_digraphs(engine, v.capital_digraphs)
    var text = v.initial, pending = emptyPending(), chain = false
    for k in v.keys {
        var ks = CKeystroke()
        ks.shift = k.shift; ks.option = k.option; ks.control = k.control
        ks.caps_lock = k.capsLock; ks.shift_broke = k.shiftBroke
        let isBackspace = k.key == "⌫"
        k.key.withCString { kp in
            ks.key = kp
            let step = text.withCString { tp -> CStep in
                if isBackspace {
                    return k.control
                        ? ipabet_engine_handle_unconvert(engine, tp, pending)
                        : ipabet_engine_handle_backspace(engine, tp, pending)
                }
                return ipabet_engine_handle_key(engine, tp, ks, pending, chain)
            }
            pending = step.pending
            chain = step.has_chain_broken ? step.chain_broken : false
            if isBackspace && step.edit.edit_type == Int32(Pass.rawValue) {
                if !k.control { text = dropLastClusterBytes(text) }
            } else {
                let native = step.edit.edit_type == Int32(Pass.rawValue) ? nativeChar(ks) : ""
                text = applyEdit(text, step.edit, native)
            }
        }
    }
    if pending.count > 0 { text += commitString(engine, pending) }
    if text == v.expected { pass += 1 }
    else if failures.count < 30 {
        failures.append("got [\(text)] want [\(v.expected)] initial=[\(v.initial)] keys=\(v.keys.map { $0.key })")
    }
}
ipabet_engine_free(engine)

for f in failures { FileHandle.standardError.write("FAIL \(f)\n".data(using: .utf8)!) }
print("\(pass) pass, \(failures.count) fail of \(vectors.count) (Rust core via the C ABI, from Swift)")
if pass * 2 < vectors.count {
    FileHandle.standardError.write("far too few passed — the harness is asserting almost nothing\n".data(using: .utf8)!)
    exit(3)
}
exit(failures.isEmpty ? 0 : 1)
