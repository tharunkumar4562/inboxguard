import os
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://lvacilaresklgbapsybb.supabase.co")  # TODO: Set your actual project URL
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "sb_publishable_2R8FGFw9jFfBKYsr-T-AzA_UkxN8M5-")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "sb_secret_JeR-z1YNJhhIl1jNftxYUzQ_J83yFDE9")

# Frontend-style (safe) client
supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# Backend (admin) client for secure server-side operations
supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
