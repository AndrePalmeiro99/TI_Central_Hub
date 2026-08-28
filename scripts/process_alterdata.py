import json
import openpyxl

# 1. Carregar mapeamentos existentes (Domínio)
secret_path = 'src/data/franchiseBases.secret.json'
try:
    with open(secret_path, 'r', encoding='utf-8') as f:
        bases = json.load(f)
except FileNotFoundError:
    bases = {}

# 2. Abrir a nova planilha de franquias Alterdata
wb = openpyxl.load_workbook('Planilha de franquias Alterdata.xlsx', data_only=True)
sheet = wb.active

new_alterdata_count = 0
duplicates_skipped = 0
inactive_skipped = 0

for r_idx, row in enumerate(sheet.iter_rows(values_only=True)):
    if r_idx == 0:
        continue
    unit = row[1]
    status = row[5]
    if unit:
        # Padronizar nome: caixa alta, remover espaços adicionais
        clean_unit = str(unit).strip().upper()
        
        # Filtro de Situação (apenas franquias ativas)
        clean_status = str(status).strip().upper() if status else ''
        if clean_status not in ['ATIVA', 'ATIVO']:
            inactive_skipped += 1
            continue
            
        # Remover prefixos "CF " ou "CF" para alinhar com o formato que vem do Onety
        if clean_unit.startswith('CF '):
            clean_unit = clean_unit[3:].strip()
        elif clean_unit.startswith('CF'):
            clean_unit = clean_unit[2:].strip()

        # Evitar sobrescrever se já existir mapeamento (Domínio)
        if clean_unit in bases:
            duplicates_skipped += 1
            # Mantemos a base antiga (prioridade), mas pode ser alterada no painel de gestão
            continue
            
        # Mapeia como Alterdata Base por padrão (Alterdata CF)
        bases[clean_unit] = 'Alterdata Base'
        new_alterdata_count += 1

# 3. Salvar no JSON secreto e também no JSON público de fallback
with open(secret_path, 'w', encoding='utf-8') as f:
    json.dump(bases, f, indent=2, ensure_ascii=False)

with open('src/data/franchiseBases.json', 'w', encoding='utf-8') as f:
    json.dump(bases, f, indent=2, ensure_ascii=False)

print(f"Fusão Concluída!")
print(f" -> {new_alterdata_count} novas unidades de Alterdata adicionadas.")
print(f" -> {duplicates_skipped} duplicidades mantidas (com base Domínio ativa).")
print(f" -> {inactive_skipped} unidades inativas puladas (inadimplentes, distratos, congeladas).")
