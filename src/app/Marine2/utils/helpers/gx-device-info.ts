// Helpers for the values venus-platform publishes about the GX device itself.

export interface NetworkService {
  technology: string
  name: string
  address: string
  netmask: string
  method: string
  state: string
  // undefined when venus-platform doesn't publish them, as in older Venus OS versions
  ipv6Addresses?: string[]
}

export interface CanInterface {
  interface: string
  name: string
}

// connman service states in which the service has its IP configuration
const CONNECTED_STATES = ["ready", "online"]

export const isConnected = (service: NetworkService) => CONNECTED_STATES.includes(service.state)

// platform/0/Network/Services is a JSON string: { <technology>: { <service name>: { Address, ... } } }
export const parseNetworkServices = (value: unknown): NetworkService[] | undefined => {
  if (typeof value !== "string" || value === "") return undefined

  let parsed: Record<string, Record<string, Record<string, unknown>>>
  try {
    parsed = JSON.parse(value)
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== "object") return undefined

  const services: NetworkService[] = []
  Object.keys(parsed).forEach((technology) => {
    const byName = parsed[technology] || {}
    Object.keys(byName).forEach((name) => {
      const service = byName[name] || {}
      services.push({
        technology,
        name,
        address: String(service.Address ?? ""),
        netmask: String(service.Netmask ?? ""),
        method: String(service.Method ?? ""),
        state: String(service.State ?? ""),
        ipv6Addresses: Array.isArray(service.Ipv6Addresses) ? service.Ipv6Addresses.map(String) : undefined,
      })
    })
  })
  return services
}

// Link-local (fe80::/10) first: on a Garmin network that is the address in use
export const sortIpv6Addresses = (addresses: string[]) => {
  const isLinkLocal = (a: string) => /^fe[89ab]/i.test(a)
  return addresses.filter(isLinkLocal).concat(addresses.filter((a) => !isLinkLocal(a)))
}

// platform/0/CanBus/Interfaces is an array of { interface, name, config }
export const parseCanInterfaces = (value: unknown): CanInterface[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item.interface === "string")
    .map((item) => ({ interface: item.interface, name: typeof item.name === "string" ? item.name : item.interface }))
}

export type N2kStatus =
  { state: "notEnabled" } | { state: "addressUnknown" } | { state: "noAddress" } | { state: "address"; address: number }

/*
 * vecanRunning: whether com.victronenergy.vecan.<interface> exists, i.e. VE.Can
 * (NMEA 2000) runs on the port. nad: its /Nad, null while the GX has no claimed
 * address, undefined on Venus OS versions without /Nad.
 */
export const getN2kStatus = (vecanRunning: boolean, nad: unknown): N2kStatus => {
  if (!vecanRunning) return { state: "notEnabled" }
  if (typeof nad === "number") return { state: "address", address: nad }
  if (nad === null) return { state: "noAddress" }
  return { state: "addressUnknown" }
}

// "255.255.255.0" -> 24, undefined when not a contiguous IPv4 netmask
export const netmaskToPrefixLength = (netmask: string): number | undefined => {
  const octets = netmask.split(".").map(Number)
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return undefined

  const bits = octets.map((o) => o.toString(2).padStart(8, "0")).join("")
  if (!/^1*0*$/.test(bits)) return undefined
  return bits.indexOf("0") === -1 ? 32 : bits.indexOf("0")
}

export const formatAddress = (service: NetworkService) => {
  if (!service.address) return ""
  const prefixLength = netmaskToPrefixLength(service.netmask)
  return prefixLength === undefined ? service.address : `${service.address}/${prefixLength}`
}
