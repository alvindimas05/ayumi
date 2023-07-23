import os
import json
import uuid
import requests
import sys
from Crypto.Cipher import AES

def encrypt(e):
    t = os.urandom(8).hex().encode('utf-8')
    n = os.urandom(8).hex().encode('utf-8')
    r = e.encode('utf-8')
    cipher = AES.new(t, AES.MODE_CBC, n)
    ciphertext = cipher.encrypt(pad_data(r))
    return ciphertext.hex() + t.decode('utf-8') + n.decode('utf-8')

def pad_data(data: bytes) -> bytes:
    block_size = AES.block_size
    padding_size = block_size - len(data) % block_size
    padding = bytes([padding_size] * padding_size)
    return data + padding

headers = {
    'Content-Type': 'application/json',
    'Referer': 'https://chat.getgpt.world/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
}
messages = json.loads(sys.argv[1])
data = json.dumps({
    'messages': messages,
    'frequency_penalty': 0,
    'max_tokens': 4000,
    'model': 'gpt-3.5-turbo',
    'presence_penalty': 0,
    'temperature': 1,
    'top_p': 1,
    'stream': False,
    'uuid': str(uuid.uuid4())
})

res = requests.post('https://chat.getgpt.world/api/chat/stream',
                    headers=headers, json={'signature': encrypt(data)})

result = ""
for line in res.iter_lines():
    if b'content' in line:
        line_json = json.loads(line.decode('utf-8').split('data: ')[1])
        result += line_json['choices'][0]['delta']['content']

print(result)