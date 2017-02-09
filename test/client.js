const BeanstalkdClient = require("../");

const expect    = require("expect");
const fs        = require("fs");

const tube = "testtube";

const expectEqual = x => r => expect(x).toEqual(r);

describe("BeanstalkdClient", function () {
  let producer, consumer, testjobid;

  before(function () {
    producer = new BeanstalkdClient();
    consumer = new BeanstalkdClient();
  });

  describe("constructor()", function () {
    it("creates a client with the passed-in options", function () {
      expect(producer.host).toEqual("127.0.0.1");
      expect(producer.port).toEqual(11300);
    });
  });

  describe("connect()", function () {
    it("creates and saves a connection", function () {
      return producer.connect().then(() => expect(producer._stream).toExist())
    });
  });

  describe("producer:", function () {
    it("#use() connects to a specific tube", function () {
      return producer.use(tube)
        .then(expectEqual(tube))
    });

    it("#listTubeUsed() returns the tube used by a producer", function () {
      producer.listTubeUsed().then(expectEqual(tube));
    });

    it("#put() submits a job", function () {
      var data = { type: "test", payload: "the explosive energy of the warhead of a missile or of the bomb load  of an aircraft" };
      return producer.put(0, 0, 60, JSON.stringify(data))
        .then(jobid => expect(jobid).toExist())
    });

    after(function () {
      return producer.stats().then(resp => {
        if (resp.version) {
          version = resp.version + ".0";
        }
      });

    });
  });

  describe("consumer:", function () {
    it("#watch() watches a tube", function () {
      return consumer.connect()
        .then(() => consumer.watch(tube))
        .then(expectEqual(2));
    });

    it("#ignore() ignores a tube", function () {
      return consumer.ignore("default").then(expectEqual("1"))
    });

    it("#listTubesWatched() returns the tubes the consumer watches", function () {
      // TODO unnest
      return consumer.listTubesWatched().then(resp => {
        expect(resp.length).toEqual(1);
        expect(resp.indexOf(tube)).toEqual(0);
      });
    });

    it("#peekReady() peeks ahead at jobs", function () {
      this.timeout(4000);
      return producer.peekReady().then(([id, payload]) => {
        expect(id).toExist();
        testjobid = id;
        const parsed = JSON.parse(payload);
        expect(parsed.type).toEqual("test");
      });
    });

    it("#statsJob() returns job stats", function () {
      // TODO -- unnest this
      return consumer.statsJob(testjobid).then(resp => {
        expect(resp.id).toEqual(testjobid);
        expect(resp.tube).toEqual(tube);
      });
    });

    it("consumer can run statsJob() while a job is reserved", function () {
      return consumer.reserve().then(([jobid]) => {
        return consumer.statsJob(jobid).then(resp => {
          expect(resp.id).toEqual(jobid);
          expect(resp.state).toEqual("reserved");
          return consumer.release(jobid, 1, 1)
        });
      });
    });

    it("#reserve() returns a job", function () {
      return consumer.reserve().then(([jobid, payload]) => {
        expect(jobid).toEqual(testjobid);
        const parsed = JSON.parse(payload);
        expect(parsed.type).toEqual("test");
      });
    });

    it("#touch() informs the server the client is still working", function () {
      return consumer.touch(testjobid);
    });

    it("#release() releases a job", function () {
      return consumer.release(testjobid, 1, 1);
    });

    it("jobs can contain binary data", function () {
      var payload = fs.readFileSync("./test/test.png");

      return producer.put(0, 0, 60, payload).then(jobid => {
        expect(jobid).toExist();

        return consumer.reserve().then(([returnID, returnPayload]) => {
          expect(returnID).toEqual(jobid);
          expect(returnPayload.length).toEqual(payload.length);

          for (let ptr = 0; ptr < returnPayload.length; ptr++) {
            expect(returnPayload[ptr]).toEqual(payload[ptr])
          }

          return consumer.destroy(returnID);
        });
      });
    });

    it("jobs can contain utf8 data", function () {
      const payload = "Many people like crème brûlée.";

      return producer.put(0, 0, 60, payload).then(jobid => {
        expect(jobid).toExist();

        return consumer.reserve().then(([returnID, returnPayload]) => {
          expect(returnID).toEqual(jobid);
          expect(returnPayload.toString()).toEqual(payload);
          return consumer.destroy(returnID);
        });
      });
    });

    it("#peekDelayed() returns data for a delayed job", function () {
      return producer.peekDelayed().then(([jobid]) => {
        expect(jobid).toEqual(testjobid);
      });
    });

    it("#bury() buries a job (> 1sec expected)", function () {
      // this takes a second because of the minumum delay enforced by release() above
      this.timeout(3000);
      return consumer.reserve().then(([jobid]) => {
        return consumer.bury(jobid, BeanstalkdClient.LOWEST_PRIORITY)
      });
    });

    it("#peekBuried() returns data for a buried job", function () {
      return producer.peekBuried().then(([jobid]) => {
        expect(jobid).toEqual(testjobid);
      });
    });

    it("#kick() un-buries jobs in the producer\"s used queue", function () {
      return producer.kick(10).then(count => {
        expect(count).toEqual("1");
      });
    });

    // NOTE -- versions of beanstalkd before 1.8 don't have kickJob
    it("#kickJob() kicks a specific job id", function () {
      return consumer.reserve().then(([jobid, payload]) => {
        return consumer.bury(testjobid, BeanstalkdClient.LOWEST_PRIORITY).then(() => {
          return producer.kickJob(testjobid);
        });
      });
    });

    it("#pauseTube() suspends new job reservations (> 1sec expected)", function () {
      return consumer.pauseTube(tube, 3).then(() => {
        return consumer.reserveWithTimeout(1)
      }).catch(err => {
        expect(err.message).toEqual("TIMED_OUT");
      });
    });

    it("#destroy() deletes a job (nearly 2 sec expected)", function () {
      // this takes a couple of seconds because of the minumum delay enforced by pauseTube() above
      this.timeout(5000);
      return consumer.reserve().then(([jobid, payload]) => {
        return consumer.destroy(jobid);
      });
    });

    it("#reserveWithTimeout() times out when no jobs are waiting (> 1sec expected)", function () {
      this.timeout(3000);
      return consumer.reserveWithTimeout(1)
        .catch(err => expect(err.message).toEqual("TIMED_OUT"));
    });
  });

  describe("server statistics", function () {
    it("#stats() returns a hash of server stats", function () {
      return consumer.stats().then(resp => {
        expect(resp.pid).toExist();
        expect(resp.version).toExist();
      });
    });

    it("#listTubes() returns a list of tubes", function () {
      return consumer.listTubes().then(resp => {
        expect(resp.length).toBeGreaterThan(0);
        expect(resp).toInclude(tube);
      });
    });

    it("#statsTube() returns a hash of tube stats", function () {
      return consumer.statsTube(tube).then(resp => {
        expect(resp).toBeA("object");
      });
    });

    it("#statsTube() returns not found for non-existent tubes", function () {
      return consumer.statsTube("i-dont-exist")
        .catch(err => {
          expect(err.message).toEqual("NOT_FOUND");
        });
    });
  });

  describe("concurrent commands", function () {
    it("can be handled", function () {
      const concurrency = 10;
      const ps = [];
      for (var i = 0; i < concurrency; ++i) {
        ps.push(consumer.statsTube(tube));
      }
      return Promise.all(ps);
    });
  });

});
