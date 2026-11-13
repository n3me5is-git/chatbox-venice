export const advancedKnowledgeItalian:Record<string,string>={
 'Virtual reranking with LLM':'Reranking virtuale tramite LLM',
 'Default text model for optional collection reranking. Each collection must enable it and approve processing its query and passages.':'Modello testuale predefinito per il reranking opzionale delle collezioni. Ogni collezione deve abilitarlo e autorizzare il trattamento della domanda e degli estratti.',
 'Choose a reranking LLM':'Scegli un LLM per il reranking',
 'Ranks at most 20 matching passages using a text model. No tools or web search. Malformed results fail without silently switching providers.':'Riordina fino a 20 estratti pertinenti con un modello testuale, senza strumenti o ricerca web. Le risposte non valide causano un errore senza cambiare provider di nascosto.',
 'The selected reranker is unavailable':'Il reranker selezionato non è disponibile',
 'Knowledge model settings changed; retry explicitly':'Le impostazioni del modello KB sono cambiate; riprova esplicitamente',
 'Knowledge model response exceeds the size limit':'La risposta del modello KB supera il limite di dimensione',
 'The knowledge model returned invalid JSON':'Il modello KB ha restituito un JSON non valido',
 'The knowledge model returned an unexpected tool call':'Il modello KB ha restituito una chiamata a strumento inattesa',
 'Knowledge model request timed out':'Tempo disponibile per la richiesta al modello KB esaurito',
 'Invalid LLM rerank passage identity':'Identificativo di estratto non valido nel reranking LLM',
 'LLM reranking exceeds the candidate limit':'Il reranking LLM supera il limite dei candidati'
}
export const advancedKnowledgeEnglish=Object.fromEntries(Object.keys(advancedKnowledgeItalian).map(key=>[key,key]))
