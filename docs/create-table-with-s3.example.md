## Table on S3 

For create table on S3 backets I use this [article](https://altinity.com/blog/clickhouse-and-s3-compatible-object-storage) on Altinity blog.

---
### Yandex Object Storage credentials

1. Create service account
2. Generate new static access key
3. Create backet, and folder if needed

### Configure ClickHouse storages

In first, you needs to mound extra hdd to VDS and after map it to docker container

[Yandex cloud manuals](https://cloud.yandex.ru/docs/compute/operations/vm-control/vm-attach-disk#mount)

Create XML file `s3-storage.xml` (chose name that you like) in `/etc/clickhouse-server/config.d/`

```xml
<clickhouse>
  <storage_configuration>
    <disks>
        <ycs3>
        <type>s3</type>
        <endpoint>https://storage.yandexcloud.net/ss-clickhouse/logs/</endpoint>
        <access_key_id>YOUR_ACCESS_KEY</access_key_id>
        <secret_access_key>YOUR_SECRET_ACCESS_KEY</secret_access_key>
        </ycs3>
        <hdd>
            <path>/extra_hdd/</path>
        </hdd>
    </disks>
      <policies>
          <tiered>
              <volumes>
                  <default>
                      <disk>default</disk>
                  </default>
                  <s3>
                      <disk>ycs3</disk>
                  </s3>
                  <hdd>
                      <disk>hdd</disk>
                  </hdd>
              </volumes>
          </tiered>
          <s3_only>
              <volumes>
                  <s3>
                      <disk>ycs3</disk>
                  </s3>
              </volumes>
          </s3_only>
      </policies>
  </storage_configuration>
</clickhouse>
```

### Create table

We're created a table with TTL

```sql
CREATE TABLE IF NOT EXISTS ${this.opts.dbTableName} (
          timestamp DateTime64(3, '${this.opts.timeZone}') DEFAULT now(),
          requestID String,
          subdomain String,
          caller String,
          level String,
          message String,
          nodeID String,
          namespace String,
          service String,
          version String,
          source String,
          hostname String,
          date Date DEFAULT today())
      ENGINE = MergeTree()
      ORDER BY (toStartOfHour(timestamp), service, level, subdomain, requestID, timestamp)
      PRIMARY KEY (toStartOfHour(timestamp), service, level, subdomain, requestID)
      PARTITION BY (date, toStartOfDay(timestamp))
      TTL date + INTERVAL 3 MONTH,
          date + INTERVAL 2 WEEK TO VOLUME 's3',
          date + INTERVAL 1 DAY TO DISK 'hdd',
          date + INTERVAL 1 DAY RECOMPRESS CODEC(ZSTD(9))
      SETTINGS storage_policy = 'tiered',
               index_granularity = 8192;
```
