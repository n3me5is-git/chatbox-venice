export const catalogItalian={
 'Run and manage this Work chat’s agents (model charges may apply)':'Esegui e gestisci gli agenti di questa chat Work (possono esserci costi dei modelli)',
 'Enable multi-agent mode in this Work chat first. External workers inherit only the features shared here and the chat’s agent policy. Guardians still review transfers. Stopping MCP sharing cancels its workers. This permission allows worker and guardian model charges.':'Attiva prima la modalità multiagente in questa chat Work. I worker esterni ereditano solo le funzioni condivise qui e i permessi degli agenti della chat. I guardian continuano a verificare i trasferimenti. Interrompere la condivisione MCP annulla i relativi worker. Questo permesso consente i costi dei modelli dei worker e dei guardian.',
 'Cost':'Costo','From':'Da','Quote required':'Serve una stima',
 'Price not supplied by the provider':'Prezzo non fornito dal provider',
 'The provider has not supplied a fixed rate. Use the model details or request an estimate with your chosen settings.':'Il provider non ha fornito una tariffa fissa. Consulta la scheda del modello o richiedi una stima con le impostazioni scelte.',
 'Catalog price, not a quality rating. Options, references and duration may change the final cost.':'Prezzo del catalogo, non valutazione della qualità. Opzioni, riferimenti e durata possono modificare il costo finale.',
 '1M tokens':'1M token','1M characters':'1M caratteri','1,000 characters':'1.000 caratteri','image':'immagine','second':'secondo','generation':'generazione','(input / output)':'(input / output)',
 'Failure reason':'Motivo del fallimento',
 'The provider returned an unreadable error response.':'Il provider ha restituito un errore non leggibile.',
 'Image editing requires references on the owner’s device.':'La modifica delle immagini richiede riferimenti sul dispositivo proprietario.',
 'Some models are hidden by your Venice Privacy Only filter.':'Alcuni modelli sono nascosti dal filtro Privacy Only di Venice.',
} as const
export const catalogEnglish=Object.fromEntries(Object.keys(catalogItalian).map(key=>[key,key])) as {[K in keyof typeof catalogItalian]:K}
