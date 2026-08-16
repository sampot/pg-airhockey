# pg-airhockey

瀏覽器**空氣曲棍球**：拖曳／鍵鼠操作球拍、彈盤進門、人機對戰先得七分。純前端；**mobile-first**，桌面加寬球桌與鍵鼠操作。

致敬空氣曲棍球類型玩法，非任一商業作品復刻。

也可當作 [Playgrounds（遊樂場）](https://play.samkuo.me/) 的 **SAM**（`index.html` 入口）。

## 一鍵開 SAM

```
https://play.samkuo.me/?open=sampot/pg-airhockey&name=空氣曲棍球&fresh=1
```

## 試玩（本機）

```bash
npx --yes serve .
```

## 測試

```bash
npx vitest run
```

（不安裝套件；以 `npx` 臨時執行。repo 不含 `node_modules`。）

## 操作

| 操作 | 說明 |
| --- | --- |
| **開局** | 開始／重開 |
| 滑鼠移到桌面下半 | 球拍即時貼齊游標（不必按住） |
| 觸控拖曳桌面下半 | 球拍跟著手指走 |
| 方向鍵／WASD | 桌面鍵盤移動球拍 |
| **音效** | 開／關（會記住） |
| **最高連勝** | 歷史最高連勝場數（敗北僅清零當前連勝） |

## License

MIT
