const mapboxAccessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ?? ''
const dataSource = import.meta.env.VITE_DATA_SOURCE === 'api' ? 'api' : 'mock'
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '') ?? 'http://localhost:3000/api/v1'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

if (dataSource === 'api' && (!supabaseUrl.startsWith('https://') || !supabasePublishableKey)) {
  throw new Error('Live mode requires VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY')
}

export const env = {
  apiBaseUrl,
  dataSource,
  isLiveData: dataSource === 'api',
  mapboxAccessToken,
  hasMapboxToken: mapboxAccessToken.startsWith('pk.'),
  supabaseUrl,
  supabasePublishableKey,
} as const
