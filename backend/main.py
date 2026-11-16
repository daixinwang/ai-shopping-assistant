"""Select an explicit deployment mode before loading application state."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env', override=False)
if os.getenv('DATABASE_URL'):
    from api.main import app
else:
    from legacy_app import app
