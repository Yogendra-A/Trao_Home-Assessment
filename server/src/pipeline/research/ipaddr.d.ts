
declare module "ipaddr.js" {
  interface IPv4Address {
    range(): string;
  }

  interface IPv6Address {
    range(): string;
  }

  type Address = IPv4Address | IPv6Address;

  function process(address: string): Address;
  function isValid(address: string): boolean;

  export { process, isValid };
  export default { process, isValid };
}
