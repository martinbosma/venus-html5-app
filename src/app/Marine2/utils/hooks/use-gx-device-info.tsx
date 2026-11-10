import { useEffect } from "react"
import { useMqtt } from "@victronenergy/mfd-modules"
import {
  CanInterface,
  getN2kStatus,
  N2kStatus,
  NetworkService,
  parseCanInterfaces,
  parseNetworkServices,
} from "../helpers/gx-device-info"

const PLATFORM_PATHS = {
  model: "platform/0/Device/Model",
  firmwareVersion: "platform/0/Firmware/Installed/Version",
  firmwareBuild: "platform/0/Firmware/Installed/Build",
  networkServices: "platform/0/Network/Services",
  linkLocalAddress: "platform/0/Network/Ethernet/LinkLocalIpAddress",
  canInterfaces: "platform/0/CanBus/Interfaces",
}

// Present only when VE.Can (NMEA 2000) runs on the port, as in gui-v2
const vecanPath = (canInterface: string) => `vecan/${canInterface}/Alarms/SameUniqueNameUsed`
// The address the GX itself has claimed on the port; invalid while it has none
const nadPath = (canInterface: string) => `vecan/${canInterface}/Nad`
const portsOf = (names: string) => names.split(",").filter((c) => c)

export interface GxDeviceInfo {
  model?: string
  firmwareVersion?: string
  firmwareBuild?: string
  networkServices?: NetworkService[]
  linkLocalAddress?: string
  n2kPorts: { port: string; status: N2kStatus }[]
}

/*
 * The app doesn't subscribe to the platform and vecan services. Subscribe to
 * the few values needed here and ask for their current value with a read
 * request, so the GX doesn't have to republish all its values.
 */
export const useGxDeviceInfo = (): GxDeviceInfo => {
  const mqtt = useMqtt()
  const { portalId, isConnected } = mqtt

  const topic = (path: string) => `N/${portalId}/${path}`
  const value = (path: string) => (portalId ? mqtt.messageFromTopic(topic(path)) : undefined) as unknown

  const canInterfaces = parseCanInterfaces(value(PLATFORM_PATHS.canInterfaces))
  // A string, so the effects only run again when the ports change
  const canInterfaceNames = canInterfaces.map((c) => c.interface).join(",")

  useEffect(() => {
    if (!portalId || !isConnected) return
    const ports = portsOf(canInterfaceNames)
    const paths = [...Object.values(PLATFORM_PATHS), ...ports.map(vecanPath), ...ports.map(nadPath)]
    paths.forEach((path) => {
      mqtt.subscribeToTopic(`N/${portalId}/${path}`)
      mqtt.publish(`R/${portalId}/${path}`, { raw: "" })
    })
  }, [mqtt, portalId, isConnected, canInterfaceNames])

  // When vecan-dbus stops, e.g. because another CAN profile is selected,
  // dbus-flashmq sends an empty payload on each of its topics. mfd-modules
  // ignores empty payloads and would keep the old values, so clear them here.
  const client = mqtt.client
  useEffect(() => {
    if (!client || !portalId) return
    const ports = portsOf(canInterfaceNames)
    const vecanTopics = new Set([...ports.map(vecanPath), ...ports.map(nadPath)].map((path) => `N/${portalId}/${path}`))
    const onMessage = (topic: string, payload: Buffer) => {
      if (payload.length === 0 && vecanTopics.has(topic)) mqtt.addMessage(topic, { value: undefined })
    }
    client.on("message", onMessage)
    return () => {
      client.removeListener("message", onMessage)
    }
  }, [mqtt, client, portalId, canInterfaceNames])

  const text = (path: string) => {
    const v = value(path)
    return typeof v === "string" && v !== "" ? v : undefined
  }

  return {
    model: text(PLATFORM_PATHS.model),
    firmwareVersion: text(PLATFORM_PATHS.firmwareVersion),
    firmwareBuild: text(PLATFORM_PATHS.firmwareBuild),
    networkServices: parseNetworkServices(value(PLATFORM_PATHS.networkServices)),
    linkLocalAddress: text(PLATFORM_PATHS.linkLocalAddress),
    n2kPorts: canInterfaces.map((c: CanInterface) => ({
      port: c.name,
      status: getN2kStatus(value(vecanPath(c.interface)) !== undefined, value(nadPath(c.interface))),
    })),
  }
}
