/* eslint-disable no-undef */
const saveSessionAndRenderDashboard = (userid) => {
  req.session.userid = userid;
  req.session.save();
  res.render('dashboard');
};

export default saveSessionAndRenderDashboard;
