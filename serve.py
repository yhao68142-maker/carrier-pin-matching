"""Host-provided port, with the verified local port as fallback."""
import os
import uvicorn

if __name__ == '__main__':
    uvicorn.run('app:app', host='0.0.0.0', port=int(os.environ.get('PORT','8876')),
                workers=1, limit_concurrency=4, timeout_keep_alive=5)
