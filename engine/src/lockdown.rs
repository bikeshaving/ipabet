// The self-imposed no-network guarantee, the Linux sibling of the macOS
// entitlement file: a seccomp BPF filter installed before any input is
// processed, making socket(AF_INET | AF_INET6 | AF_PACKET) fail with EPERM
// for the rest of the process's life. AF_UNIX stays open — the engine talks
// to its daemon over a unix domain socket. Only an out-of-process shell can
// call this: the fcitx5 addon and the Windows text service load into host
// processes whose sockets are not theirs to close.

use std::os::raw::{c_int, c_ulong};

#[repr(C)]
struct SockFilter {
    code: u16,
    jt: u8,
    jf: u8,
    k: u32,
}

#[repr(C)]
struct SockFprog {
    len: u16,
    filter: *const SockFilter,
}

unsafe extern "C" {
    fn prctl(option: c_int, a2: c_ulong, a3: c_ulong, a4: c_ulong, a5: c_ulong) -> c_int;
}

const PR_SET_NO_NEW_PRIVS: c_int = 38;
const PR_SET_SECCOMP: c_int = 22;
const SECCOMP_MODE_FILTER: c_ulong = 2;

const BPF_LD_W_ABS: u16 = 0x20;
const BPF_JMP_JEQ_K: u16 = 0x15;
const BPF_RET_K: u16 = 0x06;

const SECCOMP_RET_ALLOW: u32 = 0x7fff_0000;
const SECCOMP_RET_ERRNO: u32 = 0x0005_0000;
const EPERM: u32 = 1;

// struct seccomp_data field offsets.
const DATA_NR: u32 = 0;
const DATA_ARCH: u32 = 4;
const DATA_ARG0: u32 = 16;

#[cfg(target_arch = "x86_64")]
const AUDIT_ARCH: u32 = 0xc000_003e;
#[cfg(target_arch = "aarch64")]
const AUDIT_ARCH: u32 = 0xc000_00b7;

#[cfg(target_arch = "x86_64")]
const SYS_SOCKET: u32 = 41;
#[cfg(target_arch = "aarch64")]
const SYS_SOCKET: u32 = 198;

const AF_INET: u32 = 2;
const AF_INET6: u32 = 10;
const AF_PACKET: u32 = 17;

const fn load(offset: u32) -> SockFilter {
    SockFilter {code: BPF_LD_W_ABS, jt: 0, jf: 0, k: offset}
}

const fn jeq(value: u32, jt: u8, jf: u8) -> SockFilter {
    SockFilter {code: BPF_JMP_JEQ_K, jt, jf, k: value}
}

const fn ret(value: u32) -> SockFilter {
    SockFilter {code: BPF_RET_K, jt: 0, jf: 0, k: value}
}

pub(crate) fn apply() -> bool {
    let program = [
        load(DATA_ARCH),
        jeq(AUDIT_ARCH, 0, 6),
        load(DATA_NR),
        jeq(SYS_SOCKET, 0, 4),
        load(DATA_ARG0),
        jeq(AF_INET, 3, 0),
        jeq(AF_INET6, 2, 0),
        jeq(AF_PACKET, 1, 0),
        ret(SECCOMP_RET_ALLOW),
        ret(SECCOMP_RET_ERRNO | EPERM),
    ];
    let prog = SockFprog {len: program.len() as u16, filter: program.as_ptr()};
    unsafe {
        if prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0 {
            return false;
        }
        prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog as *const _ as c_ulong, 0, 0) == 0
    }
}
