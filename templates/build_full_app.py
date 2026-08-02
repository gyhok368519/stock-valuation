import json, os
from pypinyin import pinyin, Style

with open(r'C:\Users\DELL\.local\share\TeleAgent\TeleAgent的工作空间\.temp\app_template_v2.html', 'r', encoding='utf-8') as f:
    html = f.read()

with open(r'C:\Users\DELL\Desktop\all_stocks.json', 'r', encoding='utf-8') as f:
    stock_map = json.load(f)

with open(r'C:\Users\DELL\Desktop\stock_full_db.json', 'r', encoding='utf-8') as f:
    db = json.load(f)

# Generate STOCK_MAP JS
items = []
for code, name in sorted(stock_map.items()):
    name_safe = name.replace("'", "\\'")
    items.append('"' + code + '":"' + name_safe + '"')
stock_map_js = '{\n  ' + ',\n  '.join(items) + '\n}'

# Generate STOCK_ABBR JS
def get_abbr(name):
    parts = pinyin(name, style=Style.FIRST_LETTER)
    return ''.join(p[0] for p in parts).upper()

abbr_items = []
for code in sorted(stock_map.keys()):
    name = stock_map.get(code, '')
    abbr = get_abbr(name) if name else ''
    abbr_items.append('"' + code + '":"' + abbr + '"')
abbr_js = '{\n  ' + ',\n  '.join(abbr_items) + '\n}'

# Generate DB_HEADERS and DB_GROUPS
db_headers_js = json.dumps(db['headers'], ensure_ascii=False)
db_groups_js = json.dumps(db['groups'], ensure_ascii=False)

# Generate DB_DATA JS (5203 stocks)
db_data_lines = []
for code, row_data in db['data'].items():
    row_items = []
    for v in row_data:
        if v is None: row_items.append('null')
        elif isinstance(v, str): row_items.append(json.dumps(v, ensure_ascii=False))
        else: row_items.append(str(v))
    db_data_lines.append('"' + code + '":[' + ','.join(row_items) + ']')
db_data_js = '{\n  ' + ',\n  '.join(db_data_lines) + '\n}'

# Replace placeholders
html = html.replace('__STOCK_MAP_PLACEHOLDER__', stock_map_js)
html = html.replace('__STOCK_ABBR_PLACEHOLDER__', abbr_js)
html = html.replace('__DB_HEADERS_PLACEHOLDER__', db_headers_js)
html = html.replace('__DB_GROUPS_PLACEHOLDER__', db_groups_js)
html = html.replace('__DB_DATA_PLACEHOLDER__', db_data_js)

# Update header text
html = html.replace('5203只A股 | 176只详细财务数据', '5203只A股 | 全量财务数据')

out_path = r'C:\Users\DELL\Desktop\PB_PE_ROE_calc.html'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(html)

size = os.path.getsize(out_path)
print('Done! Size: ' + str(size) + ' bytes (' + str(size//1024) + ' KB)')
print('Stocks: ' + str(len(stock_map)) + ', DB records: ' + str(len(db['data'])))