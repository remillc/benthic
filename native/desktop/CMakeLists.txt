# SPDX-License-Identifier: GPL-2.0
# Subsurface core (unmodified) + core/compat + façade, as a static library, for
# desktop targets (linux-x64, win-x64, mac-*), plus the test executables and,
# when desktop/host/ exists, the opendives-host executable.
# Run by native/desktop/build.sh. Options taken from native/CMakeLists.txt.
cmake_minimum_required(VERSION 3.22)
project(opendives_desktop LANGUAGES C CXX)

get_filename_component(ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
if(NOT SS)
  set(SS "${ROOT}/third_party/subsurface")
endif()
set(COMPAT "${ROOT}/core/compat")
if(NOT OD_BIN_DIR)
  set(OD_BIN_DIR "${CMAKE_BINARY_DIR}/bin")
endif()
# DEPS: prefix of the dependencies (native/desktop/build-deps.sh).

# List shared with poc/build.sh and native/CMakeLists.txt.
file(STRINGS "${COMPAT}/core-files.txt" CORE_FILES)
set(SOURCES "")
foreach(f ${CORE_FILES})
  # Subsurface's platform file: windows.cpp on Windows, unix.cpp elsewhere.
  if(WIN32 AND f STREQUAL "unix")
    set(f "windows")
  endif()
  list(APPEND SOURCES "${SS}/core/${f}.cpp")
endforeach()
list(APPEND SOURCES
  "${COMPAT}/qthelper_compat.cpp"
  "${COMPAT}/notifier_compat.cpp"
  "${COMPAT}/cloud_compat.cpp"
  "${COMPAT}/https_mbedtls.cpp"
  "${COMPAT}/bluetooth_compat.cpp"
  "${ROOT}/core/libopendives/opendives.cpp"
  "${ROOT}/core/libopendives/edit.cpp"
  "${ROOT}/core/libopendives/tools.cpp"
  "${ROOT}/core/libopendives/settings.cpp"
  "${ROOT}/core/libopendives/plan.cpp"
  "${ROOT}/core/libopendives/filter.cpp"
  "${ROOT}/core/libopendives/account.cpp"
  "${ROOT}/core/libopendives/stats.cpp"
  "${ROOT}/core/libopendives/download.cpp")

file(WRITE "${CMAKE_BINARY_DIR}/gen/build-defs.h" "#define SUBSURFACE_SOURCE \"\"\n")

add_library(opendives_core STATIC ${SOURCES})
target_compile_features(opendives_core PUBLIC cxx_std_20)

# Flags shared by the library and the executables that include the façade.
set(OD_COMPILE_OPTIONS -w -O2
  "SHELL:-iquote ${COMPAT}/shadow"
  "SHELL:-include ${CMAKE_BINARY_DIR}/gen/build-defs.h")
set(OD_INCLUDES
  "${COMPAT}/qtshim" "${COMPAT}/gen" "${CMAKE_BINARY_DIR}/gen"
  "${ROOT}" "${SS}" "${SS}/libdivecomputer/include"
  "${DEPS}/include" "${DEPS}/include/libxml2")
# Subsurface's Bluetooth paths in core/libdivecomputer.cpp, with the transport
# of core/compat/bluetooth_compat.cpp.
set(OD_DEFINITIONS BT_SUPPORT BLE_SUPPORT)
if(WIN32)
  # Static libraries, as on the other targets; Subsurface's windows.cpp needs
  # a Windows 7 API level at least (Winsock, shlobj, registry).
  list(APPEND OD_DEFINITIONS LIBXML_STATIC LIBXSLT_STATIC LIBEXSLT_STATIC ZIP_STATIC NOMINMAX)
endif()

target_compile_options(opendives_core PRIVATE ${OD_COMPILE_OPTIONS})
target_compile_definitions(opendives_core PUBLIC ${OD_DEFINITIONS})
target_include_directories(opendives_core PUBLIC ${OD_INCLUDES})

# Link libraries, in dependency order. Static runtime on Windows.
set(OD_LIBS "${DEPS}/lib/libdivecomputer.a" "${DEPS}/lib/libgit2.a"
  "${DEPS}/lib/libmbedtls.a" "${DEPS}/lib/libmbedx509.a" "${DEPS}/lib/libmbedcrypto.a"
  "${DEPS}/lib/libzip.a" "${DEPS}/lib/libxslt.a" "${DEPS}/lib/libxml2.a"
  "${DEPS}/lib/libsqlite3.a" "${DEPS}/lib/libz.a")
if(WIN32)
  list(APPEND OD_LIBS pthread ws2_32 rpcrt4 crypt32 secur32 bcrypt advapi32 shell32 ole32 user32 shlwapi)
  target_link_options(opendives_core PUBLIC -static)
elseif(APPLE)
  list(APPEND OD_LIBS m "-framework CoreFoundation" "-framework Security")
else()
  list(APPEND OD_LIBS pthread dl m)
endif()
target_link_libraries(opendives_core PUBLIC ${OD_LIBS})

# Test executables: the same programs as poc/build.sh, against opendives_core.
# On Windows each executable carries a manifest that makes its narrow strings UTF-8.
set(OD_EXE_EXTRA "")
if(WIN32)
  enable_language(RC)
  set(OD_EXE_EXTRA "${CMAKE_CURRENT_SOURCE_DIR}/utf8.rc")
endif()

set(TESTS roundtrip facade)
foreach(t ${TESTS})
  add_executable(${t} "${ROOT}/tests/${t}.cpp" ${OD_EXE_EXTRA})
  target_compile_options(${t} PRIVATE ${OD_COMPILE_OPTIONS})
  target_link_libraries(${t} PRIVATE opendives_core)
endforeach()

# opendives-host: the desktop application's native host, written in desktop/host/.
file(GLOB HOST_SOURCES "${ROOT}/desktop/host/*.cpp")
if(HOST_SOURCES)
  add_executable(opendives-host ${HOST_SOURCES} ${OD_EXE_EXTRA})
  target_compile_options(opendives-host PRIVATE ${OD_COMPILE_OPTIONS})
  target_link_libraries(opendives-host PRIVATE opendives_core)
endif()

# Binaries in <build>/bin.
set_target_properties(${TESTS} PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${OD_BIN_DIR}")
if(HOST_SOURCES)
  set_target_properties(opendives-host PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${OD_BIN_DIR}")
endif()
