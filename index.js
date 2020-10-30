const TelegramBot = require("node-telegram-bot-api");
const opcua = require("node-opcua");
const fs = require("fs");

//Подключение к боту
const token = "YOUR__TELEGRAMBOT__TOKEN";
const bot = new TelegramBot(token, { polling: true });

const file = JSON.parse(fs.readFileSync("./usersID.json", "utf-8"));

//Для новых пользователей
bot.on("new_chat_members", (user) => {
  // const file = JSON.parse(fs.readFileSync("./usersID.json", "utf-8"));
  file.ID.push(user.from.id);
  fs.writeFileSync("./usersID.json", JSON.stringify(file, null, 2));
});

//Для существющих при отправке сообщения ID добавляется в JSON
bot.on("message", (user) => {
  // const file = JSON.parse(fs.readFileSync("./usersID.json", "utf-8"));
  if (!file.ID.includes(user.from.id)) {
    file.ID.push(user.from.id);
    fs.writeFileSync("./usersID.json", JSON.stringify(file, null, 2));
  }
});

//Настройка opcua клиента
const connectionStrategy = {
  initialDelay: 1000,
  maxRetry: 1,
};
const options = {
  applicationName: "MyClient",
  connectionStrategy: connectionStrategy,
  securityMode: opcua.MessageSecurityMode.None,
  securityPolicy: opcua.SecurityPolicy.None,
  endpoint_must_exist: false,
};
const client = opcua.OPCUAClient.create(options);
const endpointUrl = "opc.tcp://User-PC:53530/OPCUA/SimulationServer";

async function main() {
  try {
    // Подключение к opcua серверу
    await client.connect(endpointUrl);

    // Создание сессии
    const session = await client.createSession();

    // Случайные граничные условия  0<min<1 && 0<max<10
    const upBorder = Math.random() * (10 - 1);
    const minBorder = Math.random();

    let variables = [];

    const subscription = opcua.ClientSubscription.create(session, {
      requestedPublishingInterval: 1000,
      requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 100,
      publishingEnabled: true,
      priority: 10,
    });

    //Настройка монитора
    const ids = ["01", "02", "03", "04", "05", "06", "07", "09", "09", 10];
    const itemsMonitor = ids.map((id) => ({
      nodeId: "ns=3;i=10" + id,
      attributeId: opcua.AttributeIds.Value,
    }));

    const parameters = {
      samplingInterval: 100,
      discardOldest: true,
      queueSize: 10,
    };

    const monitoredItems = opcua.ClientMonitoredItemGroup.create(
      subscription,
      itemsMonitor,
      parameters,
      opcua.TimestampsToReturn.Both
    );
    const addZero = (data) => {
      return data.toString().length === 1 ? "0" + data : data;
    };
    //Отправка сообщений всем пользователям
    function send() {
      file.ID.map((userID) => {
        const date = new Date();
        bot.sendMessage(
          userID,
          `Время: ${addZero(date.getHours())}:${addZero(
            date.getMinutes()
          )}, ${addZero(date.getDate())}.${addZero(
            date.getMonth()
          )}.${date.getFullYear()}\nПроизошло пересечение одной из границ. \nНижняя граница: ${minBorder}; \nВерхняя граница: ${upBorder}; \nЗначения: \n${variables
            .filter((el) => el)
            .toString()
            .trim()
            .replace(/,/g, "\n")}`
        );
      });
    }
    const tempArr = [];
    monitoredItems.on("changed", (item, dataValue, index) => {
      tempArr[index] = dataValue.value.value;
      if (
        tempArr.filter((el) => el).length === 10 &&
        JSON.stringify(tempArr) != JSON.stringify(variables)
      ) {
        variables = [];
        tempArr.map((el, index) => {
          if (el < minBorder || el > upBorder) {
            variables[index] = el;
          } else {
            tempArr[index] = null;
          }
        });
        if (index === tempArr.length - 1 && variables.length > 0) {
          send();
        }
      }
    });
    // await session.close();

    // await client.disconnect();
  } catch (err) {
    console.log("An error has occured : ", err);
  }
}
main();
