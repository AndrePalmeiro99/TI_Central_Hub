import os
import glob
import re
import json

folder_path = r"c:\Users\Usuario\Downloads\Grupo de empresas (franquias) - Bases - 1,2 e 3"
files = glob.glob(os.path.join(folder_path, "*.xls"))

all_data = {}

for file in files:
    with open(file, "rb") as f:
        content = f.read()
    
    text = content.decode('iso-8859-1', errors='ignore')
    clean_text = text.replace('\x00', '')
    
    base_match = re.search(r"Base\s*(\d)", os.path.basename(file), re.IGNORECASE)
    base_num = base_match.group(1) if base_match else "Desconhecida"
    base_name = f"Domínio Base {base_num}"
    
    idx = clean_text.find('N o m e')
    if idx == -1:
        idx = clean_text.find('Nome')
    
    if idx != -1:
        snippet = clean_text[idx:]
        snippet = re.sub(r'[^\x20-\x7E\xC0-\xFF]', ' ', snippet)
        
        # Split by multiple spaces
        tokens = [t.strip() for t in re.split(r'\s{2,}', snippet) if t.strip()]
        
        # Remove 'Nome' and other headers
        if tokens and tokens[0] == 'Nome':
            tokens = tokens[1:]
        
        # Add to dictionary
        for token in tokens:
            # simple filter for valid franchise names (uppercase, length > 2)
            if re.match(r'^[A-Z0-9\s\.\-\/ÇÃÁÉÍÓÚ]{3,}$', token):
                if token not in ["INTERNO", "TESTE"]:
                    all_data[token] = base_name

# Write the actual data to franchiseBases.secret.json
with open(r"c:\Users\Usuario\Documents\GitHub\dashboard-tarefa\src\data\franchiseBases.secret.json", "w", encoding="utf-8") as f:
    json.dump(all_data, f, indent=2, ensure_ascii=False)

# Write dummy data to franchiseBases.json (so the app doesn't break if secret is missing)
dummy_data = {
    "FRANQUIA EXEMPLO": "Domínio Base 1",
    "OUTRA FRANQUIA": "Domínio Base 2",
    "MAIS UMA": "Domínio Base 3",
    "SEM BASE REGISTRADA": "Sem Base"
}

with open(r"c:\Users\Usuario\Documents\GitHub\dashboard-tarefa\src\data\franchiseBases.json", "w", encoding="utf-8") as f:
    json.dump(dummy_data, f, indent=2, ensure_ascii=False)

print("Mapping generated securely.")
