import json
import re

# Read the file with UTF-16 encoding (Windows PowerShell default)
with open('raw_content.txt', 'r', encoding='utf-16') as f:
    content = f.read()

# Extract JSON from JSONP response
match = re.search(r'setResponse\((\{.*\})\);', content, re.DOTALL)
if match:
    json_str = match.group(1)
    obj = json.loads(json_str)
    
    rows = obj['table']['rows']
    
    print("=" * 180)
    print("GOOGLE SHEETS DATA - COLUMNS M, N, O, P (FIRST 15 ROWS WITH NON-NULL VALUES)")
    print("=" * 180)
    print()
    
    row_counter = 0
    for row_idx, row in enumerate(rows):
        if row_counter >= 15:
            break
        
        cells = row['c']
        school_name = cells[0]['v'] if cells[0] and cells[0].get('v') else ""
        
        # Get columns M(12), N(13), O(14), P(15) - handle None cells
        m_val = cells[12]['v'] if cells[12] and cells[12].get('v') is not None else None
        n_val = cells[13]['v'] if cells[13] and cells[13].get('v') is not None else None
        o_val = cells[14]['v'] if cells[14] and cells[14].get('v') is not None else None
        p_val = cells[15]['v'] if cells[15] and cells[15].get('v') is not None else None
        
        # Check if any value is non-null
        has_data = any(v is not None for v in [m_val, n_val, o_val, p_val])
        
        if has_data:
            row_counter += 1
            m_f = cells[12].get('f', 'N/A') if cells[12] else 'N/A'
            n_f = cells[13].get('f', 'N/A') if cells[13] else 'N/A'
            o_f = cells[14].get('f', 'N/A') if cells[14] else 'N/A'
            p_f = cells[15].get('f', 'N/A') if cells[15] else 'N/A'
            
            print(f"Row {row_counter} (Sheet Row {row_idx+1}): {school_name}")
            print(f"  M (ENERGIA):      v={repr(m_val):<25} f={repr(m_f)}")
            print(f"  N (ÁGUA):         v={repr(n_val):<25} f={repr(n_f)}")
            print(f"  O (OUTROS):       v={repr(o_val):<25} f={repr(o_f)}")
            print(f"  P (OBSERVAÇÃO):   v={repr(p_val):<25} f={repr(p_f)}")
            print()
    
    print()
    print("=" * 180)
    print("SUMMARY")
    print("=" * 180)
    print(f"Total schools in sheet: {len(rows)}")
    
    # Count rows with any non-null M/N/O/P
    rows_with_data = 0
    for row in rows:
        has_any = False
        for i in [12, 13, 14, 15]:
            if row['c'][i] and row['c'][i].get('v') is not None:
                has_any = True
                break
        if has_any:
            rows_with_data += 1
    
    print(f"Rows with data in columns M/N/O/P: {rows_with_data}")
    print()
    
    # Count non-null values for each column
    m_count = sum(1 for row in rows if row['c'][12] and row['c'][12].get('v') is not None)
    n_count = sum(1 for row in rows if row['c'][13] and row['c'][13].get('v') is not None)
    o_count = sum(1 for row in rows if row['c'][14] and row['c'][14].get('v') is not None)
    p_count = sum(1 for row in rows if row['c'][15] and row['c'][15].get('v') is not None)
    
    print(f"Non-null values in column M (ENERGIA): {m_count}")
    print(f"Non-null values in column N (ÁGUA): {n_count}")
    print(f"Non-null values in column O (OUTROS): {o_count}")
    print(f"Non-null values in column P (OBSERVAÇÃO): {p_count}")
else:
    print("ERROR: Could not extract JSON from JSONP response")
