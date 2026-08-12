cmake_minimum_required(VERSION 3.16)
project(fcitx5-ipabet VERSION 0.1.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN ON)

find_package(Fcitx5Core REQUIRED)

# The engine is the Rust staticlib in engine/, built by cargo — the same
# crate and the same C ABI header the Windows port uses. Building it here
# rather than expecting a prior `cargo build` keeps one command in the loop.
set(ENGINE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../engine")
set(ENGINE_LIB "${ENGINE_DIR}/target/release/libipabet_engine.a")
# rustup puts cargo in ~/.cargo/bin, which a non-login shell (ssh, CI) does not
# have on PATH — look there too rather than failing at build time.
find_program(CARGO cargo HINTS "$ENV{HOME}/.cargo/bin" REQUIRED)
add_custom_command(
    OUTPUT "${ENGINE_LIB}"
    COMMAND "${CARGO}" build --release
    WORKING_DIRECTORY "${ENGINE_DIR}"
    COMMENT "Building the IPAbet engine (cargo)"
    VERBATIM)
add_custom_target(ipabet_engine_build DEPENDS "${ENGINE_LIB}")

add_library(ipabet MODULE src/ipabet.cpp)
add_dependencies(ipabet ipabet_engine_build)
set_target_properties(ipabet PROPERTIES PREFIX "lib")
target_include_directories(ipabet PRIVATE "${ENGINE_DIR}/include")
target_link_libraries(ipabet PRIVATE Fcitx5::Core "${ENGINE_LIB}")

# Where the addon finds spec/ipabet.json when it is not running from an
# install tree — the build directory case, so a dev loop needs no install step.
target_compile_definitions(ipabet PRIVATE
    IPABET_SPEC_FALLBACK="${CMAKE_CURRENT_SOURCE_DIR}/../../spec/ipabet.json")

install(TARGETS ipabet DESTINATION "${FCITX_INSTALL_ADDONDIR}")
install(FILES ipabet-addon.conf
        RENAME ipabet.conf
        DESTINATION "${FCITX_INSTALL_PKGDATADIR}/addon")
install(FILES ipabet-im.conf
        RENAME ipabet.conf
        DESTINATION "${FCITX_INSTALL_PKGDATADIR}/inputmethod")
install(FILES "${CMAKE_CURRENT_SOURCE_DIR}/../../spec/ipabet.json"
        DESTINATION "${FCITX_INSTALL_PKGDATADIR}/ipabet")
