cmake_minimum_required(VERSION 3.21)
project(ipabet-tsf VERSION 0.1.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# The Rust staticlib links against the dynamic CRT, so the C++ side has to as
# well — mixing the two produces duplicate-symbol errors at link time rather
# than anything that explains itself.
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")

set(ENGINE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../engine")
set(ENGINE_LIB "${ENGINE_DIR}/target/release/ipabet_engine.lib")

# rustup puts cargo outside the PATH a non-login shell sees.
find_program(CARGO cargo HINTS "$ENV{USERPROFILE}/.cargo/bin" REQUIRED)
add_custom_command(
    OUTPUT "${ENGINE_LIB}"
    COMMAND "${CARGO}" build --release
    WORKING_DIRECTORY "${ENGINE_DIR}"
    COMMENT "Building the IPAbet engine (cargo)"
    VERBATIM)
add_custom_target(ipabet_engine_build DEPENDS "${ENGINE_LIB}")

add_library(ipabet SHARED
    tsf/ipabet.cpp
    tsf/dllmain.cpp
    tsf/ipabet.def)
add_dependencies(ipabet ipabet_engine_build)
target_include_directories(ipabet PRIVATE "${ENGINE_DIR}/include")
target_link_libraries(ipabet PRIVATE
    "${ENGINE_LIB}"
    # No msctf.lib: TSF is reached entirely through COM, and its interface and
    # category GUIDs come from uuid.lib, which MSVC links by default.
    ole32.lib
    oleaut32.lib
    advapi32.lib
    shlwapi.lib
    user32.lib
    # Rust's std reaches for these on Windows.
    ntdll.lib
    userenv.lib
    ws2_32.lib
    bcrypt.lib)

# The spec is data the text service reads at activation, from beside the DLL.
add_custom_command(TARGET ipabet POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/../spec/ipabet.json"
        "$<TARGET_FILE_DIR:ipabet>/ipabet.json")

# The registration probe: a console binary, no TSF text service involved, so it
# can ask what Windows thinks is registered without being the thing under test.
add_executable(profile-probe tools/profile-probe.cpp)
target_link_libraries(profile-probe PRIVATE ole32.lib)

# The typing gate's target: a real edit control with the text service active in
# the same process, since activating a text service applies to the process that
# asks for it.
add_executable(type-test tools/type-test.cpp)
target_link_libraries(type-test PRIVATE ole32.lib user32.lib)

# Debug builds compile in the keystroke logger; release builds have no logging
# capability at all.
option(IPABET_DEBUG "Compile in the debug logger" OFF)
if(IPABET_DEBUG)
    target_compile_definitions(ipabet PRIVATE IPABET_DEBUG)
endif()

# The registrar the installer calls, and the one a person runs by hand after an
# unzipped build. The DLL registers itself; this only asks it to.
add_executable(ipabet-register tools/ipabet-register.cpp)
target_link_libraries(ipabet-register PRIVATE ole32.lib)
