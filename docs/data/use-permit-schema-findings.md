# Use-permit XML schema findings

Source: `臺北市歷年使用執照摘要` downloaded from Taipei Open Data.

The first local schema report was generated correctly, but Windows redirected stdout using the local Big5/CP950 code page. When decoded as Big5, the apparent mojibake resolves to the following real schema.

## Core record

The repeated top-level permit record is `<Data>` with about 2,981–2,982 records in the current source snapshot.

Direct children observed on `<Data>`:

- 執照年度
- 執照號碼
- 發照日期
- 原核發執照
- 設計人
- 監造人
- 承造人
- 建造類別
- 構造種類
- 使用分區
- 建物資訊
- 建物面積
- 建物高度
- 工程金額
- 竣工日期
- 開工日期
- 建築地點
- 地段地號
- 建築概要
- 雜項工作物
- 停車空間
- 適用法令概要
- 注意事項
- 變更概要

## Nested structures relevant to Taipei-Maps

`建物資訊` contains:

- 棟數
- 地上層數
- 地下層數
- 戶數

`建物面積` contains:

- 騎樓基地面積
- 其他基地面積
- 建築面積
- 法定空地面積
- 地上避難面積
- 地下避難面積

Repeated leaf tags also show large counts for:

- 地址
- 樓層
- 備註說明
- 地段號
- 停車空間說明

## Bugs discovered in the first inspector

1. Redirected output inherited the Windows Big5/CP950 console encoding, so the report looked garbled when later opened as UTF-8.
2. The old `iterparse` implementation called `elem.clear()` on every child before the parent `<Data>` record was sampled, so sample values were blank even though tag names survived.

Both are fixed in the current inspector: stdout/stderr are forced to UTF-8, and complete `<Data>` sample records are captured before clearing.

## Current normalization target

The first derived tables should preserve raw values while producing normalized fields for:

- permit id
- issue/start/completion date
- completion year
- building age
- structure
- zoning
- above/below-ground floors
- building height
- raw and normalized addresses
- parcel/section values

The exploded address table will be the next input to geocoding and a later spatial join against `LOD1_2024`.
