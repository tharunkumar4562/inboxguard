import os
from supabase import create_client

url = os.environ.get("SUPABASE_URL")
# Prefer the service role key for server-side writes (subscription upserts,
# etc.). Fall back to the anon key for backward compatibility.
key = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_SERVICE_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
)

supabase_admin = None

if url and key:
    try:
        supabase_admin = create_client(url.strip(), key.strip())
        print("✅ Supabase connected")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
else:
    print("⚠️ Missing Supabase keys in Environment Variables")
