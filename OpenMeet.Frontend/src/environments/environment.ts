const isProduction = typeof window !== 'undefined' && !window.location.hostname.includes('localhost');
const isSubpath = isProduction && window.location.pathname.includes('/openmeet');
const pathPrefix = isSubpath ? '/openmeet' : '';
const baseUrl = isProduction ? pathPrefix : 'http://localhost:5148';
const wsProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';

export const environment = {
  apiBaseUrl: `${baseUrl}/api`,
  signalRHubUrl: `${baseUrl}/hubs/meeting`,
  liveKitUrl: isProduction ? `${wsProtocol}//${window.location.host}/livekit` : 'ws://localhost:7880'
};
