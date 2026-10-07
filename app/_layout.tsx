import './global.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Slot } from 'one'
import { Platform } from 'react-native'

const queryClient = new QueryClient()

export default function Layout() {
  if (Platform.OS === 'web') {
    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, viewport-fit=cover"
          />
          <meta name="theme-color" content="#0b0f0c" />
          <title>Karro — find parking that'll still be there</title>
          <link rel="icon" href="/favicon.svg" />
          <link rel="manifest" href="/manifest.webmanifest" />
          <link rel="apple-touch-icon" href="/icons/icon-180.png" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta
            name="apple-mobile-web-app-status-bar-style"
            content="black-translucent"
          />
          <script src="/register-sw.js" defer />
        </head>
        <QueryClientProvider client={queryClient}>
          <Slot />
        </QueryClientProvider>
      </html>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
    </QueryClientProvider>
  )
}
