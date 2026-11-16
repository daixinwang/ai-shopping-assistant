"""Cross-worker bounded admission using expiring Redis leases and Redis time."""
import os
import uuid
from infrastructure.cache import client, prefix

_ACQUIRE = """
local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now)
if redis.call('ZCARD',KEYS[1]) >= tonumber(ARGV[1]) then return 0 end
redis.call('ZADD',KEYS[1],now+30000,ARGV[2]); redis.call('EXPIRE',KEYS[1],60)
return 1
"""
_RENEW = """
local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
local expiry=redis.call('ZSCORE',KEYS[1],ARGV[1])
if not expiry or tonumber(expiry)<=now then return 0 end
redis.call('ZADD',KEYS[1],now+30000,ARGV[1]); redis.call('EXPIRE',KEYS[1],60)
return 1
"""


class CapacityBusy(RuntimeError):
    pass


class Admission:
    def __init__(self):
        self.key = prefix()+':chat:inflight'
        self.token = uuid.uuid4().hex

    def acquire(self):
        limit = max(1,int(os.getenv('CHAT_MAX_INFLIGHT','16')))
        if not client().eval(_ACQUIRE,1,self.key,limit,self.token):
            raise CapacityBusy('聊天服务已达到并发上限，请稍后重试')

    def renew(self):
        return bool(client().eval(_RENEW,1,self.key,self.token))

    def release(self):
        client().zrem(self.key,self.token)
