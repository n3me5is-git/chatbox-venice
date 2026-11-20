export const chatRetentionItalian: Record<string, string> = {
  'Temporary chat': 'Chat temporanea',
  'This chat is hidden and will be deleted when you switch chats.': 'La chat rimane nascosta e viene eliminata quando cambi conversazione.',
  'Save temporary chat': 'Salva chat temporanea',
  'Save as a standard chat': 'Salva come chat standard',
  'Save as an expiring chat': 'Salva come chat effimera',
  'Keep this chat for': 'Conserva questa chat per',
  'At expiry, Chatbox deletes the chat and its app files. Files in linked folders stay where they are.': 'Alla scadenza, Chatbox elimina la chat e i file che gestisce. I file nelle cartelle collegate restano al loro posto.',
  'Chat expires {{date}}': 'La chat scade il {{date}}',
  'Save chat': 'Salva chat',
  'Unable to save this temporary chat. Please try again.': 'Impossibile salvare questa chat temporanea. Riprova.',
}

export const chatRetentionEnglish = Object.fromEntries(Object.keys(chatRetentionItalian).map(key => [key, key]))
