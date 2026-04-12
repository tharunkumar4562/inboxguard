import os
from supabase import create_client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")

supabase_admin = None

if url and key:
    try:
        supabase_admin = create_client(url.strip(), key.strip())
        print("✅ Supabase connected")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
else:
    print("⚠️ Missing Supabase keys in Environment Variables")
