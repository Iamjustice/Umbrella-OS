# ws-scrcpy for linux/arm64 (AWS Graviton), built natively from upstream source.
#
# Why: the prebuilt aaronyes/ws-scrcpy image is amd64-only and SIGSEGVs under
# QEMU on Graviton. This reproduces the image that was hand-built on the box
# (node:20-bookworm-slim + android-tools-adb, `npm run dist`, prod deps in dist/).
#
# WS_SCRCPY_REF: the original build was `git clone --depth 1` of master on
# ~2026-09-08 (package version 0.9.0-dev). Its exact SHA was not recorded; the
# default below is upstream master's HEAD at that date (first parent of the
# 2026-09-30 merge cd6cea6). Override with --build-arg if needed.
ARG NODE_IMAGE=node:20-bookworm-slim

FROM ${NODE_IMAGE} AS build
ARG WS_SCRCPY_REPO=https://github.com/NetrisTV/ws-scrcpy.git
ARG WS_SCRCPY_REF=8855ad1184ec7b41f1b28d1b899856f828e09c3e

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git init -q . \
 && git remote add origin "${WS_SCRCPY_REPO}" \
 && git fetch -q --depth 1 origin "${WS_SCRCPY_REF}" \
 && git checkout -q FETCH_HEAD \
 && git log -1 --format='ws-scrcpy %H %cd' > /ws-scrcpy-version.txt

# --ignore-scripts skips the Appium/xcuitest postinstall (iOS only, not needed).
RUN npm install --ignore-scripts \
 && npm run dist \
 && cd dist \
 && npm install --omit=dev

FROM ${NODE_IMAGE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends android-tools-adb \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /src/dist /app/dist
COPY --from=build /ws-scrcpy-version.txt /app/ws-scrcpy-version.txt
COPY scrcpy-start.sh /usr/local/bin/scrcpy-start.sh
RUN chmod +x /usr/local/bin/scrcpy-start.sh

# adbkit reads ADB_HOST/ADB_PORT as the *ADB server* address. Setting them to
# the device address made goog-device-list return nothing, so keep them empty
# and pass the device via REDROID_HOST/REDROID_PORT instead.
ENV ADB_HOST= \
    ADB_PORT= \
    REDROID_HOST=172.18.0.1 \
    REDROID_PORT=5555

EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/scrcpy-start.sh"]
CMD []
