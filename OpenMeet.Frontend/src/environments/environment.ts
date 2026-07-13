const isProduction = typeof window !== 'undefined' && !window.location.hostname.includes('localhost');
const isSubpath = isProduction && window.location.pathname.includes('/openmeet');
const pathPrefix = isSubpath ? '/openmeet' : '';
const baseUrl = isProduction ? pathPrefix : 'http://localhost:5148';

export const environment = {
  apiBaseUrl: `${baseUrl}/api`,
  signalRHubUrl: `${baseUrl}/hubs/meeting`,
  liveKitUrl: isProduction ? 'ws://4.193.121.134:7880' : 'ws://localhost:7880'
};
