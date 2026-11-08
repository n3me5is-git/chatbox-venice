import {Stack,Text} from '@mantine/core'
import {useTranslation} from 'react-i18next'
import {failureReason} from '@shared/providers/definitions/models/venice/failure-reason'
import {forkT as ft} from '@/i18n/fork'
export function GenerationFailureReason({error}:{error:string|undefined}){useTranslation();return <Stack gap={4} mt="xs"><Text size="xs" fw={600}>{ft('Failure reason')}{error?.match(/HTTP \d{3}/)?.[0]?' · '+error.match(/HTTP \d{3}/)![0]:''}</Text><Text size="sm" component="div" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:180,overflowY:'auto',touchAction:'pan-y'}}>{ft(failureReason(error||'')||'The provider did not supply an error reason.')}</Text></Stack>}
