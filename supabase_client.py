import os
from supabase import create_client

# 1. Pull keys from Railway environment or use hardcoded fallback
url = os.environ.get("SUPABASE_URL", "https://lvacilaresklgbapsybb.supabase.co")
key = os.environ.get("SUPABASE_ANON_KEY", "sb_publishable_2R8FGFw9jFfBKYsr-T-AzA_UkxN8M5-")
service_key = os.environ.get("SUPABASE_SERVICE_KEY", "sb_secret_JeR-z1YNJhhIl1jNftxYUzQ_J83yFDE9")

# 2. Debugging prints (Check your Railway logs for these!)
if not url:
	print("⚠️ WARNING: SUPABASE_URL is missing!")
if not key:
	print("⚠️ WARNING: SUPABASE_ANON_KEY is missing!")
if not service_key:
	print("⚠️ WARNING: SUPABASE_SERVICE_KEY is missing!")

# 3. Create client safely
supabase = None
supabase_admin = None

try:
	# We .strip() to remove any accidental spaces or hidden characters
	supabase = create_client(url.strip(), key.strip())
	supabase_admin = create_client(url.strip(), service_key.strip())
	print("✅ Supabase Client initialized successfully!")
except Exception as e:
	print(f"❌ CRITICAL ERROR: Could not initialize Supabase. {e}")
