// ==============================================================================
// Block 1: IP Pseudonymization — ipcrypt-rs (MIT License)
// crate: ipcrypt-rs v0.9.4  (crates.io/crates/ipcrypt-rs)
//
// Replaces 121 lines of hand-rolled Crypto-PAn implementation (AES-128).
// ipcrypt-rs provides prefix-preserving IPv4/IPv6 encryption natively via IpcryptPfx.
//
// Prefix-preserving property: IPs that share a network prefix (e.g., /24 subnet)
// map to synthetic IPs that share the same synthetic prefix. This allows the
// database to run location-based logic (geo-distribution, impossible travel
// detection) on synthetic IPs without storing the real identifiers.
//
// CONTEXT.md: "the proxy can intercept IP addresses and swap them with
// mathematically distinct but geographically identical IP addresses (ASN-aware
// IP replacement)."
// ==============================================================================

use ipcrypt_rs::IpcryptPfx;
use std::net::IpAddr;
use tracing::info;

pub struct IpPseudonymizer {
    inner: IpcryptPfx,
}

impl IpPseudonymizer {
    /// Creates a pseudonymizer with a 32-byte AES key (two 16-byte halves).
    /// Production: load key from KMS (HashiCorp Vault / OpenBao).
    pub fn new(key: [u8; 32]) -> Self {
        info!("IpPseudonymizer initialized — ipcrypt-rs IpcryptPfx (prefix-preserving).");
        Self {
            inner: IpcryptPfx::new(key),
        }
    }

    /// Applies prefix-preserving pseudonymization to an IP address.
    /// Handles both IPv4 and IPv6 transparently via IpcryptPfx.
    pub fn pseudonymize(&self, ip: IpAddr) -> IpAddr {
        self.inner.encrypt_ipaddr(ip)
    }

    /// Reverses the pseudonymization — used for authorized decryption only.
    pub fn reveal(&self, ip: IpAddr) -> IpAddr {
        self.inner.decrypt_ipaddr(ip)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    #[test]
    fn test_prefix_preserving_pseudonymization() {
        // AES 32-byte test key
        let key = [
            0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6,
            0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c,
            0xa9, 0xf5, 0xba, 0x40, 0xdb, 0x21, 0x4c, 0x37,
            0x98, 0xf2, 0xe1, 0xc2, 0x34, 0x56, 0x78, 0x9a,
        ];
        let p = IpPseudonymizer::new(key);

        let ip1 = IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8));
        let ip2 = IpAddr::V4(Ipv4Addr::new(8, 8, 8, 9));

        let s1 = p.pseudonymize(ip1);
        let s2 = p.pseudonymize(ip2);

        // 1-to-1: distinct inputs must produce distinct outputs
        assert_ne!(ip1, s1, "Pseudonymized IP must differ from original");
        assert_ne!(s1, s2, "Distinct IPs must produce distinct synthetic IPs");

        // Reversibility
        assert_eq!(p.reveal(s1), ip1, "reveal() must recover original IP");

        // Prefix preservation
        if let (IpAddr::V4(v1), IpAddr::V4(v2)) = (s1, s2) {
            let b1 = u32::from_be_bytes(v1.octets());
            let b2 = u32::from_be_bytes(v2.octets());
            let mask = !0u32 << 1; // 31-bit mask
            assert_eq!(b1 & mask, b2 & mask, "Prefix preservation violated");
        }
    }
}
