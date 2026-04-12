import os
from supabase import create_client

# 1. Pull keys from Railway environment
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")

# 2. Debugging prints (Check your Railway logs for these!)
if not url:
	print("⚠️ WARNING: SUPABASE_URL is missing!")
if not key:
	print("⚠️ WARNING: SUPABASE_ANON_KEY is missing!")

# 3. Create client safely
supabase = None
try:
	# We .strip() to remove any accidental spaces or hidden characters
	supabase = create_client(url.strip(), key.strip())
	print("✅ Supabase Client initialized successfully!")
except Exception as e:
	print(f"❌ CRITICAL ERROR: Could not initialize Supabase. {e}")
