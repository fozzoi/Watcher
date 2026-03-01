import axios from 'axios';

// Cache DNS responses to prevent spamming the DoH server
const dnsCache = new Map<string, string>();

// Cloudflare DoH Endpoint
const DOH_PROVIDER = 'https://cloudflare-dns.com/dns-query';

export const resolveDomain = async (url: string): Promise<string | null> => {
  try {
    // Extract hostname from URL (e.g., "api.themoviedb.org" from "https://api.themoviedb.org/3/...")
    const match = url.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/i);
    if (!match || match.length < 3) return null;

    const hostname = match[2];

    // Check if it's already an IP address
    const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);
    if (isIp) return null; // No need to resolve

    // Return cached IP if available
    if (dnsCache.has(hostname)) {
      return dnsCache.get(hostname)!;
    }

    console.log(`🔍 [DoH] Resolving: ${hostname}`);

    // Request A Record (IPv4)
    const response = await axios.get(DOH_PROVIDER, {
      params: {
        name: hostname,
        type: 'A', // A Record
      },
      headers: {
        'accept': 'application/dns-json',
      },
    });

    if (response.data.Answer && response.data.Answer.length > 0) {
      // Get the last answer (usually the IP)
      const ip = response.data.Answer[response.data.Answer.length - 1].data;
      
      // Basic IP validation
      if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
        dnsCache.set(hostname, ip);
        return ip;
      }
    }
    
    return null;
  } catch (error) {
    console.warn('⚠️ [DoH] Resolution failed, falling back to system DNS', error);
    return null;
  }
};

export const applyDohToUrl = (originalUrl: string, ip: string): string => {
  // Replace the hostname in the URL with the IP address
  const match = originalUrl.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/i);
  if (match && match[2]) {
    return originalUrl.replace(match[2], ip);
  }
  return originalUrl;
};
