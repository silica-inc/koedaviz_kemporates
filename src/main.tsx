import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ChakraProvider, createSystem, defaultConfig } from '@chakra-ui/react'
import App from './App.tsx'
import './index.css'

const system = createSystem(defaultConfig, {
  theme: {
    tokens: {
      colors: {
        gray: {
          950: { value: '#0d1117' },
        },
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <App />
    </ChakraProvider>
  </StrictMode>,
)
