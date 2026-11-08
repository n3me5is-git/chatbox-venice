import React from 'react'
import {createRoot} from 'react-dom/client'
import {MantineProvider} from '@mantine/core'
import NiceModal from '@ebay/nice-modal-react'
import i18n from 'i18next'
import {initReactI18next} from 'react-i18next'
import {translationResources} from '../../packages/chatbox-i18n/src'
import {CollaborationContent} from '../../src/renderer/components/collaboration/CollaborationPanel'
import '@mantine/core/styles.css'
import {CatalogReview} from './CatalogReview'
await i18n.use(initReactI18next).init({lng:'en',fallbackLng:'en',resources:translationResources,interpolation:{escapeValue:false}})
const mode=new URLSearchParams(location.search).get('mode')
createRoot(document.getElementById('root')!).render(<MantineProvider><NiceModal.Provider><main style={{padding:16,maxWidth:900,margin:'auto'}}>{mode==='catalog'?<CatalogReview/>:<CollaborationContent sessionId={mode==='host'?'demo':undefined}/>}</main></NiceModal.Provider></MantineProvider>)
