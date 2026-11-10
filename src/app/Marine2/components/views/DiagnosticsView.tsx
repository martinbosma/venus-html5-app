import React, { useEffect, useState } from "react"
import MainLayout from "../ui/MainLayout"
import DiagnosticsTable from "../ui/DiagnosticsTable"
import { MqttStore, useMqtt } from "@victronenergy/mfd-modules"
import { translate } from "react-i18nify"
import { observer } from "mobx-react-lite"
import { useWindowSize } from "../../utils/hooks/use-window-size"
import Paginator from "../ui/Paginator"
import { useBrowserFeatures, WebGLDiagnostics } from "../../utils/hooks/use-browser-features"
import Button from "../ui/Button"
import { GxDeviceInfo, useGxDeviceInfo } from "../../utils/hooks/use-gx-device-info"
import { formatAddress, isConnected, N2kStatus, NetworkService } from "../../utils/helpers/gx-device-info"
import packageInfo from "../../../../../package.json"
import { BUILD_TIMESTAMP } from "../../utils/constants/generic"

const DiagnosticsView = () => {
  const mqtt = useMqtt()
  const windowSize = useWindowSize()
  const browserFeatures = useBrowserFeatures()
  const gxDeviceInfo = useGxDeviceInfo()
  // Re-render to sync button label when diagConsole visibility changes (including [Close])
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    if (window.diagConsole) {
      window.diagConsole.onVisibilityChange(() => forceUpdate((n) => n + 1))
      return () => window.diagConsole?.onVisibilityChange(null)
    }
  }, [])

  const toggleDiagConsole = () => {
    if (window.diagConsole) {
      window.diagConsole.toggle()
    }
  }

  const gxDiagnostics = (
    <DiagnosticsTable title={translate("diagnostics.gx.gxDevice")} diagnostics={getGxDiagnostics(gxDeviceInfo)} />
  )

  // One row per CAN port, named as in the GX settings
  const n2kDiagnostics =
    gxDeviceInfo.n2kPorts.length > 0 ? (
      <DiagnosticsTable
        title={translate("diagnostics.gx.n2k")}
        diagnostics={gxDeviceInfo.n2kPorts.map(({ port, status }) => ({
          property: port,
          value: formatN2kStatus(status),
        }))}
      />
    ) : null

  const connectionDiagnostics = (
    <DiagnosticsTable
      title={translate("diagnostics.connection.connection")}
      diagnostics={getConnectionDiagnostics(mqtt)}
    />
  )

  const deviceDiagnostics = (
    <DiagnosticsTable
      title={translate("diagnostics.device.device")}
      diagnostics={[
        ...getDeviceDiagnostics(windowSize, browserFeatures),
        {
          property: translate("diagnostics.device.diagConsole"),
          value: (
            <Button onClick={toggleDiagConsole} size="md">
              {window.diagConsole?.isVisible()
                ? translate("diagnostics.device.hideDiagConsole")
                : translate("diagnostics.device.showDiagConsole")}
            </Button>
          ),
        },
      ]}
    />
  )

  return (
    <MainLayout title={translate("diagnostics.diagnostics")}>
      <div className={"h-full w-full overflow-hidden"}>
        <Paginator orientation={"vertical"}>
          <div className={"container mx-auto max-w-screen-md mb-4"}>{gxDiagnostics}</div>
          <div className={n2kDiagnostics ? "container mx-auto max-w-screen-md mb-4" : ""}>{n2kDiagnostics}</div>
          <div className={"container mx-auto max-w-screen-md mb-4"}>{connectionDiagnostics}</div>
          <div className={"container mx-auto max-w-screen-md"}>{deviceDiagnostics}</div>
        </Paginator>
      </div>
    </MainLayout>
  )
}

const getColorSchemePreferences = () => {
  const prefersDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches
  const prefersLightMode = window.matchMedia("(prefers-color-scheme: light)").matches
  const prefersHighContrast = window.matchMedia("(prefers-contrast: high)").matches
  const prefersLowContrast = window.matchMedia("(prefers-contrast: low)").matches

  const preferences = [
    prefersDarkMode ? translate("diagnostics.device.prefersDarkMode") : undefined,
    prefersLightMode ? translate("diagnostics.device.prefersLightMode") : undefined,
    prefersHighContrast ? translate("diagnostics.device.prefersHighContrast") : undefined,
    prefersLowContrast ? translate("diagnostics.device.prefersLowContrast") : undefined,
  ]
    .filter((str) => str !== undefined)
    .join(", ")

  return preferences || translate("diagnostics.device.unspecified")
}

const formatMethod = (method: string) => {
  switch (method) {
    case "dhcp":
      return "DHCP"
    case "manual":
    case "fixed":
      return translate("diagnostics.gx.static")
    default:
      return method
  }
}

const formatNetworkService = (service?: NetworkService) => {
  if (!service || !isConnected(service)) return translate("diagnostics.gx.notConnected")
  return [formatAddress(service) || "-", formatMethod(service.method)].filter((s) => s).join(", ")
}

// One row per Ethernet service and per connected Wi-Fi network; the Wi-Fi
// services also include every network found in a scan.
const getNetworkDiagnostics = (services?: NetworkService[]) => {
  if (!services) return [{ property: translate("diagnostics.gx.ethernet"), value: "-" }]

  const rows = (label: string, list: NetworkService[]) =>
    (list.length > 0 ? list : [undefined]).map((service, index) => ({
      property: list.length > 1 ? `${label} ${index + 1}` : label,
      value: formatNetworkService(service),
    }))

  const ethernet = services.filter((s) => s.technology === "ethernet")
  const wifi = services.filter((s) => s.technology === "wifi")
  return [
    ...rows(translate("diagnostics.gx.ethernet"), ethernet),
    ...(wifi.length > 0 ? rows(translate("diagnostics.gx.wifi"), wifi.filter(isConnected)) : []),
  ]
}

const formatN2kStatus = (status: N2kStatus) => {
  switch (status.state) {
    case "address":
      return translate("diagnostics.gx.n2kAddress", { address: status.address })
    case "noAddress":
      return translate("diagnostics.gx.n2kNoAddress")
    case "addressUnknown":
      return translate("diagnostics.gx.n2kAddressUnknown")
    default:
      return translate("diagnostics.gx.n2kNotEnabled")
  }
}

const getGxDiagnostics = (info: GxDeviceInfo) => {
  return [
    {
      property: translate("diagnostics.gx.product"),
      value: info.model ?? "-",
    },
    {
      property: translate("versionInfo.venusOs"),
      value: info.firmwareVersion
        ? `${info.firmwareVersion}${info.firmwareBuild ? ` (${info.firmwareBuild})` : ""}`
        : "-",
    },
    {
      property: translate("diagnostics.gx.app"),
      value: `${packageInfo.version} ${process.env.REACT_APP_WHITELABEL} (${BUILD_TIMESTAMP})`,
    },
    ...getNetworkDiagnostics(info.networkServices),
    ...(info.linkLocalAddress
      ? [{ property: translate("diagnostics.gx.linkLocal"), value: info.linkLocalAddress }]
      : []),
  ]
}

const getConnectionDiagnostics = (mqtt: MqttStore) => {
  return [
    {
      property: translate("diagnostics.connection.portalId"),
      value: mqtt.portalId ?? "-",
    },
    {
      property: translate("diagnostics.connection.status"),
      value: mqtt.status,
    },
    {
      property: translate("diagnostics.connection.error"),
      value: mqtt.error ? `${mqtt.error}` : translate("diagnostics.connection.none"),
    },
    {
      property: translate("diagnostics.connection.host"),
      value: mqtt.client?.options?.host ?? "-",
    },
  ]
}

function formatWebGLDiagnostics(webgl: WebGLDiagnostics | null): string {
  if (!webgl || !webgl.contextType) return translate("diagnostics.device.webglNotSupported")

  const parts: string[] = [webgl.contextType]

  if (webgl.renderer) parts.push(webgl.renderer)
  if (webgl.maxTextureSize) parts.push(`tex=${webgl.maxTextureSize}`)
  if (webgl.maxRenderbufferSize) parts.push(`rb=${webgl.maxRenderbufferSize}`)
  if (webgl.maxVertexAttribs) parts.push(`attribs=${webgl.maxVertexAttribs}`)
  if (webgl.maxVaryingVectors) parts.push(`varyings=${webgl.maxVaryingVectors}`)
  if (webgl.maxTextureImageUnits) parts.push(`texUnits=${webgl.maxTextureImageUnits}`)
  parts.push(`${webgl.supportedExtensions.length} extensions`)

  if (webgl.missingQtExtensions.length > 0) {
    parts.push(`${translate("diagnostics.device.missing")} ${webgl.missingQtExtensions.join(", ")}`)
  }

  return parts.join(", ")
}

const getDeviceDiagnostics = (
  windowSize: { width?: number; height?: number },
  browserFeatures: {
    isGuiV2Supported: boolean
    missingFeatures: string[]
    webglDiagnostics: WebGLDiagnostics | null
  },
) => {
  return [
    {
      property: translate("diagnostics.device.userAgent"),
      value: window.navigator.userAgent,
    },
    {
      property: translate("diagnostics.device.viewport"),
      value: `${windowSize.width ?? window.innerWidth} x ${windowSize.height ?? window.innerHeight} (${window.screen.width} x ${window.screen.height}) [${window.devicePixelRatio ?? 1}px/pt]`,
    },
    {
      property: translate("diagnostics.device.colorScheme"),
      value: getColorSchemePreferences(),
    },
    {
      property: translate("diagnostics.device.isGuiV2Supported"),
      value: `${browserFeatures.isGuiV2Supported ? translate("common.yes") : translate("common.no")}${browserFeatures.isGuiV2Supported === false ? ", " + translate("diagnostics.device.missing") + " " + browserFeatures.missingFeatures.join(", ") : ""}`,
    },
    {
      property: translate("diagnostics.device.webgl"),
      value: formatWebGLDiagnostics(browserFeatures.webglDiagnostics),
    },
  ]
}

export default observer(DiagnosticsView)
