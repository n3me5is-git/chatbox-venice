import { Text } from '@mantine/core'
import type { SharedAuthor } from '@shared/collaboration'
import { forkT as ft } from '@/i18n/fork'
export function MessageAuthor({author}:{author:SharedAuthor}){return <Text data-collaboration-author={author.id} size="xs" fw={600} c="dimmed" title={author.id}>{author.id==='owner'?ft('Owner'):author.name} · {author.id.slice(0,8)}</Text>}
