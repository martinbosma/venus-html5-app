import {
  formatAddress,
  getN2kStatus,
  isConnected,
  netmaskToPrefixLength,
  parseCanInterfaces,
  parseNetworkServices,
} from "./gx-device-info"

const services = JSON.stringify({
  ethernet: {
    Wired: {
      Address: "192.168.1.10",
      Gateway: "192.168.1.1",
      Method: "dhcp",
      Netmask: "255.255.255.0",
      State: "online",
    },
  },
  wifi: {
    Boat: { Address: "172.24.24.5", Method: "manual", Netmask: "255.255.0.0", State: "ready" },
    Neighbour: { Address: "", Method: "", Netmask: "", State: "idle" },
  },
})

describe("parseNetworkServices", () => {
  it("lists every service with its technology", () => {
    const parsed = parseNetworkServices(services)!
    expect(parsed.map((s) => `${s.technology}/${s.name}`)).toEqual(["ethernet/Wired", "wifi/Boat", "wifi/Neighbour"])
    expect(parsed[0]).toMatchObject({ address: "192.168.1.10", method: "dhcp", state: "online" })
  })

  it("returns undefined for a missing or invalid value", () => {
    expect(parseNetworkServices(undefined)).toBeUndefined()
    expect(parseNetworkServices("")).toBeUndefined()
    expect(parseNetworkServices("{")).toBeUndefined()
  })
})

describe("isConnected", () => {
  it("is true for ready and online only", () => {
    const [wired, boat, neighbour] = parseNetworkServices(services)!
    expect([wired, boat, neighbour].map(isConnected)).toEqual([true, true, false])
  })
})

describe("netmaskToPrefixLength", () => {
  it.each([
    ["255.255.255.0", 24],
    ["255.255.0.0", 16],
    ["255.255.255.255", 32],
    ["0.0.0.0", 0],
    ["255.0.255.0", undefined],
    ["", undefined],
    ["255.255.255", undefined],
  ])("%s -> %s", (netmask, expected) => {
    expect(netmaskToPrefixLength(netmask)).toBe(expected)
  })
})

describe("formatAddress", () => {
  it("adds the prefix length when the netmask is valid", () => {
    const [wired] = parseNetworkServices(services)!
    expect(formatAddress(wired)).toBe("192.168.1.10/24")
    expect(formatAddress({ ...wired, netmask: "" })).toBe("192.168.1.10")
    expect(formatAddress({ ...wired, address: "" })).toBe("")
  })
})

describe("parseCanInterfaces", () => {
  it("keeps interface and name, falling back to the interface", () => {
    expect(
      parseCanInterfaces([
        { config: 0, interface: "vecan0", name: "VE.Can port 1" },
        { config: 0, interface: "can1" },
        { name: "no interface" },
      ]),
    ).toEqual([
      { interface: "vecan0", name: "VE.Can port 1" },
      { interface: "can1", name: "can1" },
    ])
    expect(parseCanInterfaces(undefined)).toEqual([])
  })
})

describe("getN2kStatus", () => {
  it("is not enabled without a vecan service, whatever the address", () => {
    expect(getN2kStatus(false, 240)).toEqual({ state: "notEnabled" })
    expect(getN2kStatus(false, undefined)).toEqual({ state: "notEnabled" })
  })

  it("has the claimed address", () => {
    expect(getN2kStatus(true, 240)).toEqual({ state: "address", address: 240 })
    expect(getN2kStatus(true, 0)).toEqual({ state: "address", address: 0 })
  })

  it("has no address while /Nad is invalid", () => {
    expect(getN2kStatus(true, null)).toEqual({ state: "noAddress" })
  })

  it("doesn't know the address without /Nad", () => {
    expect(getN2kStatus(true, undefined)).toEqual({ state: "addressUnknown" })
  })
})
