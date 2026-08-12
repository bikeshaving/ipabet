cmake_minimum_required(VERSION 3.16)
project(ibus-ipabet VERSION 0.1.2 LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

find_package(PkgConfig REQUIRED)
pkg_check_modules(IBUS REQUIRED IMPORTED_TARGET ibus-1.0)

# The engine is the Rust staticlib in engine/, the same crate the fcitx5 addon
# and the Windows text service link.
set(ENGINE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../engine")
set(ENGINE_LIB "${ENGINE_DIR}/target/release/libipabet_engine.a")
find_program(CARGO cargo HINTS "$ENV{HOME}/.cargo/bin" REQUIRED)
add_custom_command(
    OUTPUT "${ENGINE_LIB}"
    COMMAND "${CARGO}" build --release
    WORKING_DIRECTORY "${ENGINE_DIR}"
    COMMENT "Building the IPAbet engine (cargo)"
    VERBATIM)
add_custom_target(ipabet_engine_build_ibus DEPENDS "${ENGINE_LIB}")

add_executable(ibus-engine-ipabet src/engine.c)
add_dependencies(ibus-engine-ipabet ipabet_engine_build_ibus)
target_include_directories(ibus-engine-ipabet PRIVATE
    "${ENGINE_DIR}/include" "${CMAKE_CURRENT_SOURCE_DIR}/../common")
target_link_libraries(ibus-engine-ipabet PRIVATE PkgConfig::IBUS "${ENGINE_LIB}")
target_compile_definitions(ibus-engine-ipabet PRIVATE
    IPABET_SPEC_FALLBACK="${CMAKE_CURRENT_SOURCE_DIR}/../../spec/ipabet.json")

set(LIBEXECDIR "${CMAKE_INSTALL_PREFIX}/libexec")
configure_file(ipabet.xml.in "${CMAKE_CURRENT_BINARY_DIR}/ipabet.xml" @ONLY)

install(TARGETS ibus-engine-ipabet DESTINATION libexec)
install(FILES "${CMAKE_CURRENT_BINARY_DIR}/ipabet.xml"
        DESTINATION share/ibus/component)
install(FILES "${CMAKE_CURRENT_SOURCE_DIR}/../../spec/ipabet.json"
        DESTINATION share/ipabet)
