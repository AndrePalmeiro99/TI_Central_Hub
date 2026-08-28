import os
import json
import urllib.request
import urllib.error

def load_env():
    env_vars = {}
    if os.path.exists(".env"):
        with open(".env", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    env_vars[key.strip()] = val.strip()
    return env_vars

def fetch_table(url, anon_key, table_name):
    print(f"Buscando dados da tabela '{table_name}'...")
    endpoint = f"{url}/rest/v1/{table_name}?select=*"
    req = urllib.request.Request(endpoint)
    req.add_header("apikey", anon_key)
    req.add_header("Authorization", f"Bearer {anon_key}")
    
    try:
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                print(f"Sucesso: {len(data)} registros carregados.")
                return data
    except urllib.error.HTTPError as e:
        print(f"Erro HTTP ao buscar {table_name}: {e.code} - {e.reason}")
    except Exception as e:
        print(f"Erro inesperado ao buscar {table_name}: {e}")
    return []

def format_sql_value(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    # Escape single quotes for SQL strings
    escaped = str(val).replace("'", "''")
    return f"'{escaped}'"

def generate_sql_inserts(backup_data):
    sql_lines = [
        "-- =========================================================================",
        "-- SCRIPT DE RESTAURAÇÃO DE DADOS DE MIGRAÇÃO (SUPABASE BACKUP)",
        "-- =========================================================================",
        ""
    ]
    
    for table_name, records in backup_data.items():
        if not records:
            continue
            
        sql_lines.append(f"-- Tabela: {table_name}")
        sql_lines.append(f"TRUNCATE TABLE public.{table_name} CASCADE;")
        
        columns = list(records[0].keys())
        cols_str = ", ".join(columns)
        
        for record in records:
            vals = [format_sql_value(record[col]) for col in columns]
            vals_str = ", ".join(vals)
            sql_lines.append(f"INSERT INTO public.{table_name} ({cols_str}) VALUES ({vals_str});")
            
        sql_lines.append("")
        
    return "\n".join(sql_lines)

def main():
    env = load_env()
    supabase_url = env.get("VITE_SUPABASE_URL") or env.get("SUPABASE_URL")
    supabase_key = env.get("VITE_SUPABASE_ANON_KEY") or env.get("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        print("Erro: Credenciais do Supabase não encontradas no arquivo .env!")
        return

    tables = ["franchise_bases", "franchise_royalties_config", "tarefa_metadata", "audit_log"]
    backup = {}
    
    for t in tables:
        backup[t] = fetch_table(supabase_url, supabase_key, t)
        
    # Save to JSON
    json_path = "supabase_backup.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(backup, f, indent=2, ensure_ascii=False)
    print(f"\nBackup em JSON salvo com sucesso em: {json_path}")
    
    # Save to SQL
    sql_path = "insert_backup_data.sql"
    sql_content = generate_sql_inserts(backup)
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write(sql_content)
    print(f"Script de inserções SQL salvo com sucesso em: {sql_path}")
    print("\nProcesso de exportação concluído com êxito!")

if __name__ == "__main__":
    main()
