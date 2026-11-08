import {useState} from 'react'
import {Alert,Button,Stack,Title} from '@mantine/core'
import catalog from '../../test/fixtures/venice/catalog-2026-11-08.json'
import type {MediaCatalogItem} from '@shared/providers/definitions/models/venice/media'
import {responseFailureReason} from '@shared/providers/definitions/models/venice/failure-reason'
import {VeniceModelSelect} from '../../src/renderer/components/venice/VeniceModelSelect'
import {VeniceModelCost} from '../../src/renderer/components/venice/VeniceModelCost'
import {GenerationFailureReason} from '../../src/renderer/components/venice/GenerationFailureReason'
const models=catalog.models as unknown as MediaCatalogItem[]
export function CatalogReview(){const [id,setId]=useState('krea-2-turbo'),[error,setError]=useState('');return <Stack><Title order={2}>Catalog verification</Title><VeniceModelSelect label="Model" models={models} value={id} onChange={value=>value&&setId(value)}/><VeniceModelCost model={models.find(model=>model.id===id)} showLabel/><Button onClick={()=>void responseFailureReason(new Response('{"error":{"message":"Krea 2 Turbo does not support style references."}}',{status:400})).then(setError)}>Simulate a failed generation</Button>{error&&<Alert color="red" title="Generation Failed"><GenerationFailureReason error={error}/></Alert>}</Stack>}
